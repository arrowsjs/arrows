import gulp from 'gulp'
import runSequence from 'run-sequence'
import babel from 'gulp-babel'
import cleancss from 'gulp-clean-css'
import concat from 'gulp-concat'
import htmlmin from 'gulp-htmlmin'
import rename from 'gulp-rename'
import shell from 'gulp-shell'
import uglify from 'gulp-uglify'

gulp.task('build-parser', shell.task([
  'mkdir -p dist',
  'jison src/grammar.jison -o dist/parser.js',
]));

gulp.task('minify-parser', () => {
  return gulp.src('dist/parser.js')
  .pipe(uglify({}))
  .pipe(rename('parser.min.js'))
  .pipe(gulp.dest('dist'));
});

gulp.task('build-dist', () => {
  return gulp.src([
    'dist/parser.min.js',
    'src/arrows.js',
    'src/builtins.js',
    'src/combinators.js',
    'src/types.js',
    'src/typechecker.js',
    'src/util.js',
  ])
    .pipe(concat('arrows.js'))
    .pipe(gulp.dest('./dist'));
  return gulp.src('grammar.js')
});

gulp.task('babel', () => {
  return gulp.src('dist/arrows.js')
    .pipe(babel({
      presets: ['env'],
    }))
    .pipe(rename('arrows.es5.js'))
    .pipe(gulp.dest('dist'));
});

gulp.task('minify', () => {
  return gulp.src('dist/arrows.es5.js')
    .pipe(uglify({
      output: {
        comments: true,
      },
    }))
    .pipe(rename('arrows.min.js'))
    .pipe(gulp.dest('dist'));
});

gulp.task('build', callback => {
  runSequence(
    'build-parser',
    'minify-parser',
    'build-dist',
    'babel',
    'minify',
    callback
  );
});
