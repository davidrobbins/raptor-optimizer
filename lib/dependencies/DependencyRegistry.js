var nodePath = require('path');
var extend = require('raptor-util').extend;
var inherit = require('raptor-util').inherit;
var Dependency = require('./Dependency');
var CONTENT_TYPE_CSS = require('../content-types').CSS;
var CONTENT_TYPE_JS = require('../content-types').JS;
var ok = require('assert').ok;
var typePathRegExp = /^(\w+)\s*:\s*(.+)$/;



function createDefaultNormalizer(registry) {

    function parsePath(path) {
        var typePathMatches = typePathRegExp.exec(path);
        if (typePathMatches) {
            return {
                type: typePathMatches[1],
                path: typePathMatches[2]
            };
        } else {
            var type = registry.typeForPath(path);

            if (!type) {
                type = 'package';
            }

            return {
                type: type,
                path: path
            };
        }
    }

    return function(dependency) {
        if (typeof dependency === 'string') {
            dependency = parsePath(dependency);
        } else {
            // the dependency doesn't have a type so try to infer it from the path
            if (!dependency.type) {
                if (dependency.package) {
                    dependency.type = 'package';
                    dependency.path = dependency.package;
                    delete dependency.package;
                } else if (dependency.path) {
                    var parsed = parsePath(dependency.path);
                    dependency.type = parsed.type;
                    dependency.path = parsed.path;
                }
            }
        }
        return dependency;
    };
}

function DependencyRegistry() {
    this.registeredTypes = {};
    this.extensions = {};
    this.requireExtensions = {};
    this.normalizers = [createDefaultNormalizer(this)];
    this.registerDefaults();
}

DependencyRegistry.prototype = {
    __DependencyRegistry: true,

    registerDefaults: function() {
        this.registerStyleSheetType('css', require('./dependency-resource'));
        this.registerJavaScriptType('js', require('./dependency-resource'));
        this.registerJavaScriptType('comment', require('./dependency-comment'));
        this.registerJavaScriptType('loader-metadata', require('./dependency-loader-metadata'));
        this.registerPackageType('package', require('./dependency-package'));
        this.registerExtension('optimizer.json', 'package');
    },

    typeForPath: function(path) {
        // Find the type from the longest matching file extension.
        // For example if we are trying to infer the type of "jquery-1.8.3.js" then we will try:
        // a) "8.3.js"
        // b) "3.js"
        // c) "js"
        path = nodePath.basename(path);

        var type = this.extensions[path];

        if (type) {
            // This is to handle the case where the extension
            // is the actual filename. For example: "optimizer.json"
            return type;
        }

        var dotPos = path.indexOf('.');
        if (dotPos === -1) {
            return null;
        }
        
        do {
            type = path.substring(dotPos + 1);
            if (this.extensions.hasOwnProperty(type)) {
                return this.extensions[type];
            }
            // move to the next dot position
            dotPos = path.indexOf('.', dotPos+1);
        }
        while(dotPos !== -1);

        var lastDot = path.lastIndexOf('.');
        return path.substring(lastDot+1);
    },

    addNormalizer: function(normalizerFunc) {
        ok(typeof normalizerFunc === 'function', 'function expected');
        this.normalizers.unshift(normalizerFunc);
    },
    registerType: function(type, mixins) {
        var isPackageDependency = mixins._packageDependency === true;

        mixins = extend({}, mixins);

        var properties = mixins.properties || {};
        var childProperties = Object.create(Dependency.prototype.properties);
        extend(childProperties, properties);
        mixins.properties = childProperties;

        var calculateKey = mixins.calculateKey;
        if (calculateKey) {
            mixins.doCalculateKey = calculateKey;
            delete mixins.calculateKey;
        }

        var lastModified = mixins.lastModified;
        if (lastModified) {
            mixins.doLastModified = lastModified;
            delete mixins.lastModified;
        }

        var _this = this;

        function Ctor(dependencyConfig, dirname, filename) {
            this.__dependencyRegistry = _this;
            Dependency.call(this, dependencyConfig, dirname, filename);
        }

        inherit(Ctor, Dependency);
        
        extend(Ctor.prototype, mixins);

        var hasReadFunc = Ctor.prototype.read;
        
        if (isPackageDependency && hasReadFunc) {
            throw new Error('Manifest dependency of type "' + type + '" is not expected to have a read() method.');
        }

        this.registeredTypes[type] = Ctor;
    },

    registerRequireExtension: function(ext, options, readerFunc) {
        if (typeof options === 'function') {
            readerFunc = options;
            options = {};
        } else {
            options = options || {};
        }


        this.requireExtensions[ext] = {
            reader: readerFunc,
            object: options.object === true
        };
    },

    getRegisteredRequireExtension: function(ext) {
        return this.requireExtensions[ext];
    },

    getRequireReader: function(path) {
        var lastDot = path.lastIndexOf('.');
        var ext;
        if (lastDot === -1) {
            ext = path;
        } else {
            ext = path.substring(lastDot+1);
        }
        
        var requireExt = this.getRegisteredRequireExtension(ext);
        return requireExt ? requireExt.reader : null;
    },

    registerJavaScriptType: function(type, mixins) {
        mixins.contentType = CONTENT_TYPE_JS;
        this.registerType(type, mixins);
    },

    registerStyleSheetType: function(type, mixins) {
        mixins.contentType = CONTENT_TYPE_CSS;
        this.registerType(type, mixins);
    },

    registerPackageType: function(type, mixins) {
        mixins._packageDependency = true;
        this.registerType(type, mixins);
    },

    registerExtension: function(extension, type) {
        ok(typeof extension === 'string', '"extension" argument should be a string.');
        ok(typeof type === 'string', '"type" argument should be a string');
        this.extensions[extension] = type;
    },

    getType: function(type) {
        return this.registeredTypes[type];
    },

    createDependency: function(config, dirname, filename) {
        if (!config) {
            throw new Error('"config" is required');
        }

        if (!dirname) {
            throw new Error('"dirname" is required');
        }
        
        config = this.normalizeDependency(config);
        if (typeof config !== 'object') {
            throw new Error('Invalid dependency: ' + require('util').inspect(config));
        }

        var type = config.type;
        var Ctor = this.registeredTypes[type];
        if (!Ctor) {
            throw new Error('Dependency of type "' + type + '" is not supported. (dependency=' + require('util').inspect(config) + ', package="' + filename + '"). Registered types:\n' + Object.keys(this.registeredTypes).join(', '));
        }

        return new Ctor(config, dirname, filename);
    },

    normalizeDependency: function(dependency) {
        for (var i=0, len=this.normalizers.length; i<len; i++) {
            var normalizeFunc = this.normalizers[i];
            dependency = normalizeFunc(dependency) || dependency;
        }

        return dependency;
    }

};

module.exports = DependencyRegistry;