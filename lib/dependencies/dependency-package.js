var ok = require('assert').ok;
var manifestLoader = require('../manifest-loader');
var nodePath = require('path');

module.exports = {
    properties: {
        path: 'string',
        from: 'string'
    },

    init: function() {
        this._alias = this.path; // Store a reference to the unresolved path

        var from = this.from || this.getParentManifestDir();
        delete this.from;

        try {
            this._packageManifest = this.createPackageManifest(
                manifestLoader.load(
                    this.path,
                    from));
        } catch(e) {
            if (e.fileNotFound) {
                var inFile = this.getParentManifestPath();
                throw new Error('Optimizer manifest not found for path "' + this.path + '" referenced in "' + (inFile || this.getParentManifestDir()) + '"');
            }
            else {
                throw new Error('Unable to load optimizer manifest for path "' + this.path + '". Dependency: ' + this.toString() + '. Exception: ' + (e.stack || e));
            }
        }


        this.path = this._packageManifest.filename; // Store the resolved path and use that as the key
        ok(this.path, 'this.path should not be null');

        this._dir = nodePath.dirname(this.path);
    },

    getDir: function() {
        return this._dir;
    },

    loadPackageManifest: function(optimizerContext, callback) {
        callback(null, this._packageManifest);
    }
};
