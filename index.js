'use strict';

const fs = require('fs');
const path = require('path');
const globby = require('globby');
const gutil = require('gulp-util');
const Transform = require('stream').Transform;

function verify(condition, message) {
  if (!condition) {
    throw new gutil.PluginError('gulp-prune', message);
  }
}

function normalize(file) {
  if (process.platform === 'win32') {
    file = file.replace(/\\/g, '/');
  }
  return file;
}

// The mapping function converts source name to one or more destination paths.
function getMapper(options) {
  if (options.map !== undefined) {
    verify(typeof options.map === 'function', 'options.map must be a function');
    verify(options.ext === undefined, 'options.map and options.ext are exclusive');
    return options.map;
  } else if (typeof options.ext === 'string') {
    let mapExt = options.ext;
    return (name) => name.replace(/(\.[^.]*)?$/, mapExt);
  } else if (options.ext !== undefined) {
    verify(options.ext instanceof Array && options.ext.every(e => typeof e === 'string'), 'options.ext must be a string or string[]');
    let mapExtList = options.ext.slice();
    return (name) => mapExtList.map(e => name.replace(/(\.[^.]*)?$/, e));
  } else {
    return (name) => name;
  }
}

// The delete pattern is a minimatch pattern used to find files in the dest directory.
function getDeletePattern(options) {
  if (typeof options.filter === 'string') {
    return options.filter;
  } else {
    verify(options.filter === undefined || typeof options.filter === 'function',
      'options.filter must be a string or function');
    return '**/*';
  }
}

// The delete filter is a function that selects what files to delete.  `keep` will be populated later
// as it sees files in the stream.
function getDeleteFilter(options, keep) {
  if (typeof options.filter === 'function') {
    const filter = options.filter;
    return (name) => !keep.hasOwnProperty(name) && filter(name);
  } else {
    return (name) => !keep.hasOwnProperty(name);
  }
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

    this._dest = path.resolve(dest);
    this._kept = {};
    this._mapper = getMapper(options);
    this._pattern = getDeletePattern(options);
    this._filter = getDeleteFilter(options, this._kept);

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
            this._kept[normalize(mapped)] = true;
          break;
          case 'object':
            for (let i = 0; i < mapped.length; ++i) {
              this._kept[normalize(mapped[i])] = true;
            }
          break;
          default:
            verify(false, 'options.map function must return a string or string[], or a Promise that resolves to that.');
        }
      })
      .then(() => callback(null, file), callback);
  }

  _flush(callback) {
    globby(this._pattern, { cwd: this._dest, nodir: true })
      .then(candidates => {
        let deleting = candidates.filter(this._filter);
        return Promise.all(deleting.map(f => {
          let file = path.join(this._dest, f);
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
              gutil.log('Prune:', gutil.colors.red(`${fileRelative}: ${error.message || error}`));
            }
            reject(new Error(`${fileRelative}: ${error.message || error}`));
          } else {
            if (this._verbose) {
              gutil.log('Prune:', gutil.colors.yellow(fileRelative));
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