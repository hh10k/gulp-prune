# gulp-prune

A [Gulp](http://gulpjs.com/) plugin to delete files that should not be in the destination directory.

Files that have not been seen will be deleted after the stream is flushed.

## Examples

### Prune with 1:1 mapping

All files in the target directory will be deleted unless they match the source name.

```js
var gulp = require('gulp');
var prune = require('gulp-prune');
var newer = require('gulp-newer');
var babel = require('gulp-babel');

gulp.task('build', () => {
  return gulp.src('src/**/*.js')
    .pipe(prune('build/'))
    .pipe(newer('build/'))
    .pipe(babel({ presets: ['es2015'] }))
    .pipe(gulp.dest('build/'));
});
```

### Prune with custom mapping

If the source and destination files names are different then the mapping can be customised.

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

### Prune with restrictions

If multiple build tasks all output to the same directory, add a filter so that prune only deletes what that task is expected to output.

```js
var gulp = require('gulp');
var prune = require('gulp-prune');
var newer = require('gulp-newer');
var imagemin = require('gulp-imagemin');
var uglify = require('gulp-uglify');

gulp.task('build-images', () => {
  return gulp.src('src/**/*@(.jpg|.png|.gif)')
    .pipe(prune('build/', { filter: '**/*@(.jpg|.png|.gif)' }))
    .pipe(newer('build/'))
    .pipe(imagemin())
    .pipe(gulp.dest('build/'));
});

gulp.task('build-sources', () => {
  return gulp.src('src/*.js')
    .pipe(prune('build/', { filter: '*.js' }))
    .pipe(newer('build/'))
    .pipe(uglify())
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

  A function that maps the source file name to what will be output to the `dest` directory.  The function may return a string or array of string file names.

- `options.ext`

  A convenience version of `options.map` to replace the file extension.  May be a single string or an array of strings.

- `options.filter`

  If a string, only files that match this [Minimatch](https://www.npmjs.com/package/minimatch) pattern may be pruned.

  If a function, will be called for each file to be pruned.  Return true to delete it.

- `options.verbose`

  Set to true to log all deleted files.
