'use strict';

var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var Q = require('q');

function error(msg) {
  throw new Error(msg);
}

function send(res, str) {
  var buf = new Buffer(str);
  res.charset = res.charset || 'utf-8';
  var contentType = res.getHeader('Content-Type') || 'text/html';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', buf.length);
  res.end(buf);
}

function getFileStat(filepath) {
  var deferred = Q.defer();
  fs.stat(filepath, function fsStatDone(err, fileStats){
    if (err) { return deferred.reject(err); }
    deferred.resolve(fileStats);
  });
  return deferred.promise;
}

var cache = {};

function hasCache(key) {
  return key in cache;
}

function getCacheItem(key) {
  return hasCache(key) ? cache[key] : null;
}

function setCacheItem(key, data) {
  return cache[key] = {
    mtime: new Date().getTime(),
    data: data
  };
}

function cachePromise(key, promise) {
  return promise.then(function resolve(data) {
    setCacheItem(key, data);
    return data;
  });
}

function cacheKey(options) {
  return options.file;
}

function cachedRenderPromise(options) {
  var promise = options.compile(options);
  if (!_.isFunction(promise.then)) {
    error('options.compile fn must return a promise');
  }
  return cachePromise(cacheKey(options), promise);
}

function cachedRender(options) {
  return getFileStat(cacheKey(options))
    .then(function resolve(stats) {
      var cached;
      if (!hasCache(cacheKey(options))) {
        return cachedRenderPromise(options);
      } else {
        cached = getCacheItem(cacheKey(options));
        if (cached.mtime > stats.mtime && !options.overrideCache) {
          return cached.data;
        } else {
          return cachedRenderPromise(options);
        }
      }
    });
}

function render(resHandler, options) {
  if (!_.isObject(options)) {
    error('Provide options');
  }
  cachedRender(options)
    .then(function resolveRender(data) {
      send(resHandler.res, data);
      resHandler.next();
    }, function rejectRender(err) {
      resHandler.next(err);
    });
}

function getOptions(pathname, options) {
  options = _.cloneDeep(options);
  var filepath = path.join(options.root, options.fileNameTransform(pathname));
  return _.extend(options, {
    file: filepath
  });
}

module.exports = {
  render: render,
  getOptions: getOptions
};
