'use strict';

const fs = require('fs');
const path = require('path');
const globby = require('globby');
const PluginError = require('plugin-error');
const colors = require('ansi-colors');
const log = require('fancy-log');
const Transform = require('stream').Transform;

function verify(condition, message) {
  if (!condition) {
    throw new PluginError('gulp-prune', message);
  }
}

function normalize(file) {
  if (process.platform === 'win32') {
    file = file.replace(/\\/g, '/');
  }
  return file;
}

function joinFilters(filter1, filter2) {
  return (name) => filter1(name) && filter2(name);
}

class PruneTransform extends Transform {

  constructor(dest, options) {
    super({ objectMode: true });

    // Accept prune(dest, [options]), prune(options)
    verify(arguments.length <= 2, 'too many arguments');
    if (typeof dest === 'string') {
      options = options || {};
      verify(typeof options === 'object', 'options must be an object');
      verify(options.dest === undefined, 'options.dest should not be specified with a dest argument');
    } else {
      verify(options === undefined, 'dest must be a string');
      options = dest;
      verify(typeof options === 'object', 'expected dest string or options object');
      dest = options.dest;
      verify(typeof dest === 'string', 'options.dest or dest argument must be string');
    }

    const keep = {};

    this._dest = path.resolve(dest);
    this._keep = keep;
    this._mapper = (name) => name;
    this._filter = (name) => !Object.hasOwnProperty.call(keep, name);
    this._pattern = '**/*';

    if (options.map !== undefined) {
      verify(typeof options.map === 'function', 'options.map must be a function');
      verify(options.ext === undefined, 'options.map and options.ext are incompatible');
      this._mapper = options.map;
    }

    if (options.filter !== undefined) {
      const filterType = typeof options.filter;
      verify(filterType === 'string' || filterType === 'function',
        'options.filter must be a string or function');
      if (filterType === 'string') {
        this._pattern = options.filter;
      } else {
        this._filter = joinFilters(this._filter, options.filter);
      }
    }

    if (options.ext !== undefined) {
      verify(typeof options.ext === 'string' || (options.ext instanceof Array && options.ext.every(e => typeof e === 'string')),
        'options.ext must be a string or string[]');
      const ext = typeof options.ext === 'string' ? [ options.ext ] : options.ext.slice();
      this._mapper = (name) => ext.map(e => name.replace(/(\.[^./\\]*)?$/, e));
      if (this._pattern === '**/*') {
        this._pattern = '**/*@(' + ext.join('|') + ')';
      } else {
        this._filter = joinFilters((name) => ext.some(e => name.endsWith(e)), this._filter);
      }
    }

    verify(options.verbose === undefined || typeof options.verbose === 'boolean', 'options.verbose must be a boolean');
    this._verbose = !!options.verbose;
  }

  _transform(file, encoding, callback) {
    Promise.resolve()
      .then(() => {
        const name = path.relative(file.base, file.path);
        return this._mapper(name);
      })
      .then(mapped => {
        switch (typeof mapped) {
          case 'string':
            this._keep[normalize(mapped)] = true;
          break;
          case 'object':
            for (let i = 0; i < mapped.length; ++i) {
              this._keep[normalize(mapped[i])] = true;
            }
          break;
          default:
            verify(false, 'options.map function must return a string or string[], or a Promise that resolves to that.');
        }
      })
      .then(() => callback(null, file), callback);
  }

  _flush(callback) {
    globby(this._pattern, { cwd: this._dest })
      .then(candidates => {
        const deleting = candidates.filter(this._filter);
        return Promise.all(deleting.map(f => {
          const file = path.join(this._dest, f);
          this._remove(file);
        }));
      })
      .then(deleted => callback(), callback);
  }

  _remove(file) {
    return new Promise((resolve, reject) => {
      fs.unlink(file, (error) => {
        try {
          const fileRelative = path.relative('.', file);
          if (error) {
            if (this._verbose) {
              log('Prune:', colors.red(`${fileRelative}: ${error.message || error}`));
            }
            reject(new Error(`${fileRelative}: ${error.message || error}`));
          } else {
            if (this._verbose) {
              log('Prune:', colors.yellow(fileRelative));
            }
            resolve();
          }
        } catch (e) {
          reject(e);
        }
      });
    });
  }
}

module.exports = function prune(dest, options) {
  return new PruneTransform(dest, options);
};