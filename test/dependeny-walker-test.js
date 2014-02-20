'use strict';
var chai = require('chai');
chai.Assertion.includeStack = true;
require('chai').should();
var expect = require('chai').expect;
var nodePath = require('path');

require('app-module-path').addPath(nodePath.join(__dirname, 'src'));

describe('raptor-optimizer' , function() {

    beforeEach(function(done) {
        for (var k in require.cache) {
            if (require.cache.hasOwnProperty(k)) {
                delete require.cache[k];
            }
        }

        require('raptor-promises').enableLongStacks();

        require('raptor-logging').configureLoggers({
            'raptor-optimizer': 'DEBUG'
        });

        done();
    });


    it('should allow for loader metadata with configurable bundles', function(done) {
        var dependencyWalker = require('../lib/dependency-walker');
        var OptimizerManifest = require('../lib/OptimizerManifest');
        var OptimizerContext = require('../lib/OptimizerContext');

        var optimizerManifest = new OptimizerManifest({
                dependencies: [
                    { "package": "asyncA" }
                ]
            }, __dirname);

        var context = new OptimizerContext();

        var startTime = Date.now();

        var dependencies = [];
        var contexts = [];

        dependencyWalker.walk({
                    optimizerManifest: optimizerManifest,
                    enabledExtensions: ['jquery', 'browser'],
                    context: context,
                    on: {
                        dependency: function(dependency, context) {

                            dependencies.push(dependency.toString());
                            contexts.push(context);

                            

                            // At this point we have added the dependency to a bundle and we know the bundle is not asynchronous
                            
                        }
                    }
                })
                .then(function() {
                    console.log('Walked dependency tree in ' + (Date.now() - startTime) + 'ms');

                    console.log(JSON.stringify(dependencies, null, 4));

                    expect(dependencies).to.deep.equal([
                        '[package: path="' + nodePath.join(__dirname, 'src/asyncA/optimizer.json') + '"]',
                        '[package: async=true, path="' + nodePath.join(__dirname, 'src/nestedA/optimizer.json') + '"]',
                        '[package: path="' + nodePath.join(__dirname, 'src/nestedB/optimizer.json') + '"]',
                        '[js: path="' + nodePath.join(__dirname, 'src/nestedB/nestedB.js') + '"]',
                        '[css: path="' + nodePath.join(__dirname, 'src/nestedB/nestedB.css') + '"]',
                        '[js: path="' + nodePath.join(__dirname, 'src/nestedA/nestedA.js') + '"]',
                        '[css: path="' + nodePath.join(__dirname, 'src/nestedA/nestedA.css') + '"]',
                        '[package: path="' + nodePath.join(__dirname, 'src/moduleA/optimizer.json') + '"]',
                        '[js: path="' + nodePath.join(__dirname, 'src/moduleA/moduleA.js') + '"]',
                        '[js: path="' + nodePath.join(__dirname, 'src/asyncA/asyncA.js') + '"]',
                        '[css: path="' + nodePath.join(__dirname, 'src/asyncA/asyncA.css') + '"]'
                    ]);
                    
                    done();
                })
                .fail(done);
    });
});
