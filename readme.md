# gulp-prune

A [Gulp](http://gulpjs.com/) plugin to delete files that should not be in the destination directory.

Files that have not been seen will be deleted after the stream is flushed.

## Examples

### Prune with 1:1 mapping

This example will delete all files in the target directory that do not match a source file,
after transpiling changed files.

```js
var gulp = require('gulp');
var prune = require('gulp-prune');
var newer = require('gulp-newer');
var babel = require('gulp-babel');

gulp.task('build', () => {
  return gulp.src('src/**/*.js')
    .pipe(prune('build/'))
    .pipe(newer('build/'))
    .pipe(babel({ presets: [ 'es2015' ] }))
    .pipe(gulp.dest('build/'));
});
```

### Prune with custom mapping

The mapping can be customised if the source and destination file names are different.

This example will prune all .js and .js.map files that aren't from the source .ts files.

```js
var gulp = require('gulp');
var prune = require('gulp-prune');
var newer = require('gulp-newer');
var sourcemaps = require('gulp-sourcemaps');
var typescript = require('gulp-typescript');

gulp.task('build', () => {
  return gulp.src('src/**/*.ts')
    .pipe(prune({ dest: 'build/', ext: [ '.js', '.js.map' ] }))
    .pipe(newer({ dest: 'build/', ext: '.js' }))
    .pipe(sourcemaps.init())
    .pipe(typescript())
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest('build/'));
});
```

## API

### Export

- `prune(dest)`
- `prune(dest, options)`
- `prune(options)`

### Options

- `options.dest` (or `dest` argument)

  The directory to prune files from.

- `options.map`

  A function that maps the source file name to what is expected in the `dest` directory.  The function may return a string
  or array of string file names to keep.  Can't be used with options.ext.

- `options.filter`

  If a string, only files that match this [Minimatch](https://www.npmjs.com/package/minimatch) pattern may be pruned.

  If a function, will be called with the relative path for each file to be pruned.  Return true to delete it.

- `options.ext`

  A convenience option to both map the extension and ensure only those extensions are deleted.
  May be a single string or an array of strings.

  e.g. `{ ext: [ '.js', '.js.map' ] }` is the equivalent of

  ```js
  {
    map: (name) => [
      name.replace(/(\.[^./\\]*)?$/, '.js'),
      name.replace(/(\.[^./\\]*)?$/, '.js.map')
    ],
    filter: '**/*.@(js|js.map)'
  }
  ```

- `options.verbose`

  Set to true to log all deleted files.
