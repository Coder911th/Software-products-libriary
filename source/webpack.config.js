'use strict';

const developmentMode = true,
    watch = true,
    fileProtocolMode = false,
    outputFolderName = '/../app/client',
    inputFolderName = 'client',
    webpack = require('webpack'),
    ExtractTextPlugin = require('extract-text-webpack-plugin');

module.exports = {
    context: __dirname + '/' + inputFolderName,

    entry: {
        main: './main'
    },

    output: {
        path: __dirname + outputFolderName + '/js',
        publicPath: fileProtocolMode ? __dirname.replace(/\\/g, '/') +  outputFolderName + '/js/' : '/js/',
        filename: './[name].js',
        library: 'global'
    },

    watch: developmentMode && watch,

    watchOptions: {
        aggregateTimeout: 100
    },

    devtool: developmentMode ? 'inline-source-map' : false,

    plugins: [
        new webpack.NoEmitOnErrorsPlugin(),
        new webpack.DefinePlugin({
            developmentMode: developmentMode
        }),
        new ExtractTextPlugin('../styles/[name].css'),
        new webpack.ProvidePlugin({
            $: 'jquery',
            jQuery: 'jquery'
        })
    ],

    resolve: {
        modules: ['node_modules'],
        extensions: ['.js']
    },

    resolveLoader: {
        modules: ['node_modules'],
        moduleExtensions: ['-loader'],
        extensions: ['.js']
    },

    module: {
        loaders: [
            {
                test: /\.js$/,
                exclude: /node_modules|bower_components/,
                include: __dirname + '\\' + inputFolderName,
                loader: 'babel',
                query: {
                    presets: [
                        ['env', {
                            targets: {
                                'browsers': ['last 2 versions', 'ie >= 9']
                            }
                        }]
                    ]
                }
            },
            {
                test: /\.pug$/,
                loader: 'pug',
                options: {
                    pretty: false
                }
            },
            {
                test: /\.scss$/,
                use: ExtractTextPlugin.extract({
                    fallback: 'style',
                    use: [
                        'css',
                        {
                            loader: 'postcss',
                            options: {
                                ident: 'postcss',
                                plugins: (loader) => [
                                    require('autoprefixer')(),
                                ]
                            }
                        },
                        'sass'
                    ]
                })
            },
            {
                test: /\.css$/,
                loader: 'style!css'
            },
            {
                test: /\.(ttf|eot|woff|woff2)$/,
                loader: 'url',
                options: {
                    name: '../fonts/[name].[ext]',
                    limit: 4096
                }
            }
        ]
    }
};
