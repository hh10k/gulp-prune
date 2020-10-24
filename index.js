'use strict';

const fs = require('fs');
const path = require('path');
const globby = require('globby');
const PluginError = require('plugin-error');
const colors = require('ansi-colors');
const log = require('fancy-log');
const Transform = require('stream').Transform;

/**
 * @param {boolean} condition
 * @param {string} message
 * @returns {asserts condition}
 */
function verify(condition, message) {
  if (!condition) {
    throw new PluginError('gulp-prune', message);
  }
}

/**
 * @param {string} file
 * @returns {string}
 */
function normalize(file) {
  if (process.platform === 'win32') {
    file = file.replace(/\\/g, '/');
  }
  return file;
}

/**
 * @typedef {(path: string) => boolean} FilterFunc
 */

/**
 * @param {FilterFunc} filter1
 * @param {FilterFunc} filter2
 * @returns {FilterFunc}
 */
function joinFilters(filter1, filter2) {
  return (name) => filter1(name) && filter2(name);
}

/**
 * @typedef {(srcFile: string) => string|string[]} MapFunc
 * @typedef {{
 *     map: MapFunc,
 *     pattern: string,
 *     filter?: () => boolean,
 *     ext?: string[],
 *     verbose: boolean,
 * }} StrictOptions
 */

class PruneTransform extends Transform {

  /**
   * @param {string} dest
   * @param {StrictOptions} options
   */
  constructor(dest, options) {
    super({ objectMode: true });

    /** @type {{ [x: string]: boolean }} */
    const keep = {};

    /**
     * @private
     */
    this._dest = path.resolve(dest);
    /**
     * @private
     */
    this._keep = keep;
    /**
     * @private
     * @type {MapFunc}
     */
    this._mapper = options.map;
    /**
     * @private
     * @type {(name: string) => boolean}
     */
    this._filter = (name) => !Object.hasOwnProperty.call(keep, name);
    /**
     * @private
     */
    this._pattern = options.pattern;

    if (options.filter !== undefined) {
      this._filter = joinFilters(this._filter, options.filter);
    }

    if (options.ext !== undefined) {
      const ext = options.ext;
      this._mapper = (name) => ext.map(e => name.replace(/(\.[^./\\]*)?$/, e));
      if (this._pattern === '**/*') {
        this._pattern = '**/*@(' + ext.join('|') + ')';
      } else {
        this._filter = joinFilters((name) => ext.some(e => name.endsWith(e)), this._filter);
      }
    }

    this._verbose = options.verbose;
  }

  /**
   * @param {any} file
   * @param {BufferEncoding} encoding
   * @param {import('stream').TransformCallback} callback
   */
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

  /**
   * @param {import('stream').TransformCallback} callback
   */
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

  /**
   * @param {string} file
   */
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

/** @typedef {{
 *     map?: MapFunc,
 *     filter?: string|(() => boolean),
 *     ext?: string|string[],
 *     verbose?: boolean,
 * }} Options
 * @typedef {{
 *     dest: string,
 * } & Options} OptionsWithDest
 */

/**
 * @typedef {(dest: string) => PruneTransform} DestFunc
 * @typedef {(dest: string, options: Options) => PruneTransform} DestWithOptionsFunc
 * @typedef {(options: OptionsWithDest) => PruneTransform} DestAsOptionsFunc
 * @type {DestFunc | DestWithOptionsFunc | DestAsOptionsFunc}
 */
module.exports = function prune(dest, options) {
  // Parse, validate and normalize inputs to handle function overloads
  verify(arguments.length <= 2, 'too many arguments');
  if (typeof dest === 'string') {
    options = options || {};
    verify(typeof options === 'object', 'options must be an object');
    verify((/** @type {OptionsWithDest} */ (options)).dest === undefined, 'options.dest should not be specified with a dest argument');
  } else {
    verify(options === undefined, 'dest must be a string');
    options = (/** @type {OptionsWithDest} */ (dest));
    verify(typeof options === 'object', 'expected dest string or options object');
    dest = (/** @type {OptionsWithDest} */ (options)).dest;
    verify(typeof dest === 'string', 'options.dest or dest argument must be string');
  }

  /** @type {StrictOptions} */
  const strictOptions = {
    map: (name) => name,
    verbose: false,
    pattern: '**/*',
  };

  if (options.map !== undefined) {
    verify(typeof options.map === 'function', 'options.map must be a function');
    verify(options.ext === undefined, 'options.map and options.ext are incompatible');
    strictOptions.map = options.map;
  }

  if (options.filter !== undefined) {
    verify(typeof options.filter === 'string' || typeof options.filter === 'function', 'options.filter must be a string or function');
    if (typeof options.filter === 'string') {
      strictOptions.pattern = options.filter;
    } else {
      strictOptions.filter = options.filter;
    }
  }

  if (options.ext !== undefined) {
    if (!Array.isArray(options.ext)) {
      options.ext = [ options.ext ];
    }
    verify((options.ext instanceof Array && options.ext.every(e => typeof e === 'string')), 'options.ext must be a string or string[]');
    strictOptions.ext = options.ext.slice();
  }

  if (options.verbose !== undefined) {
    verify(typeof options.verbose === 'boolean', 'options.verbose must be a boolean');
    strictOptions.verbose = !!options.verbose;
  }

  return new PruneTransform(dest, strictOptions);
}
