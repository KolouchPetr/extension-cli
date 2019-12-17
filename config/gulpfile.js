const fs = require('fs');
const gulp = require('gulp');
const del = require('del');
const paths = require('./build.json');
const plugins = require('gulp-load-plugins')();
const webpackConfig = require('./webpack.config.js');
const webpack = require('webpack-stream');
const argv = require('yargs').argv;
const isProd = argv.prod;

/** switch to project working directory **/
process.chdir(paths.projectRootDir);

/** override default paths with project paths **/
let customPaths = null;
const pkg = JSON.parse(fs.readFileSync(argv.pkg, 'utf8'));

if (fs.existsSync(argv.config)) {
    customPaths = JSON.parse(fs.readFileSync(argv.config, 'utf8'));
} else if (pkg.xtbuild !== undefined) {
    customPaths = pkg.xtbuild;
}

if (customPaths) {
    for (let key in customPaths) {
        if (customPaths.hasOwnProperty(key)) {
            paths[key] = customPaths[key];
        }
    }
}

const clean = () => del([paths.dist + '/*']);

const scripts = done => {
    let bundles = Array.isArray(paths.js_bundles) ? paths.js_bundles : [],
        onDone = () => typeof done !== 'function' || done();

    const buildScript = b => {
        gulp.src(b.src)
            .pipe(webpack(webpackConfig), require('webpack'))
            .pipe(plugins.rename(function (path) {
                path.dirname = '';
                path.basename = b.name;
            }))
            .pipe(gulp.dest(paths.dist))
            .on('end', function () {
                if (bundles.length === 0) {
                    return onDone();
                }
                return buildScript(bundles.pop());
            });
    };

    return !bundles.length ? onDone() : buildScript(bundles.pop());
};

const styles = done => {
    let bundles = Array.isArray(paths.scss_bundles) ?
        paths.scss_bundles : [{src: paths.scss, name: 'styles.css'}],
        count = bundles.length,
        isDone = false;

    return !count ? done() :
        bundles.map(scss => {
            gulp.src(scss.src)
                .pipe(plugins.sass())
                .pipe(plugins.if(isProd, plugins.cleanCss()))
                .pipe(plugins.concat(scss.name))
                .pipe(gulp.dest(paths.dist + '/css'))
                .on('end', function () {
                    if ((--count === 0) && !isDone) {
                        isDone = true;
                        return typeof done !== 'function' || done();
                    }
                    return true;
                });
        });
};

const copyAs = done => {
    return !paths.copyAsIs.length ? done() :
        gulp.src(paths.copyAsIs)
            .pipe(plugins.rename(path => {
                path.dirname = '';
            }))
            .pipe(gulp.dest(paths.dist))
            .on('end', done);
};

const copyManifest = () => {

    const {version} = pkg,
        manifest_dir = require('path').dirname(paths.manifest);

    return gulp.src(paths.manifest)
        .pipe(plugins.jsonEditor({
            'version': version,
            'version_name': version
        }))
        .pipe(gulp.dest(manifest_dir))
        .pipe(plugins.jsonminify())
        .pipe(gulp.dest(paths.dist));
};

const copyImages = () => {
    return gulp.src(paths.icons)
        .pipe(gulp.dest(paths.dist + '/icons'));
};

const locales = done => {
    let bundles = Array.isArray(paths.locales_list) ?
        paths.locales_list : [],
        onDone = () => typeof done !== 'function' || done(),
        count = bundles.length,
        isDone = false;

    return !count ? onDone() : paths.locales_list.map(language => {
        let root = paths.locales_dir + language;

        if (fs.existsSync(root)) {
            return gulp.src(root + '/**/*.json')
                .pipe(plugins.mergeJson({fileName: 'messages.json'}))
                .pipe(plugins.jsonminify())
                .pipe(gulp.dest(paths.dist + '/_locales/' + language))
                .on('end', function () {
                    if ((--count === 0) && !isDone) {
                        isDone = true;
                        return onDone();
                    }
                    return true;
                });
        }

        return true;
    });
};

const buildHtml = () => {
    return gulp.src(paths.html)
        .pipe(plugins.htmlmin({collapseWhitespace: true}))
        .pipe(plugins.rename(path => {
            path.dirname = '';
        }))
        .pipe(gulp.dest(paths.dist));
};

const release = done => {
    return isProd ? gulp.src(paths.dist + '/**/*')
        .pipe(plugins.zip('release.zip'))
        .pipe(gulp.dest(paths.releases))
        .on('end', done) : done();
};

const watch = () => {
    console.log('watching...');
    gulp.watch(paths.js, scripts);
    gulp.watch([paths.scss], styles);
    gulp.watch(paths.manifest, copyManifest);
    gulp.watch(paths.icons, copyImages);
    gulp.watch(paths.locales + '**/*.json', locales);
    gulp.watch(paths.html, buildHtml);
};

const build = gulp.series(
    clean,
    gulp.series(
        scripts,
        styles,
        copyAs,
        copyManifest,
        copyImages,
        locales,
        buildHtml),
    release
);

/*
 * Define default task that can be called by just running `gulp` from cli
 */
exports.default = build;

exports.watch = gulp.series(build, watch);
