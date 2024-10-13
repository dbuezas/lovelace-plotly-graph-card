import CssMinimizerPlugin from 'css-minimizer-webpack-plugin'
import HtmlWebPackPlugin from 'html-webpack-plugin'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'

export default {
  output: {
    filename: '[contenthash].js'
  },
  devtool: 'source-map',
  resolve: {
    extensions: ['.mjs', '.js', '.ts']
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader']
      },
      {
        // Monaco editor uses .ttf icons.
        test: /\.(svg|ttf)$/,
        type: 'asset/resource'
      },
      {
        test: /\.ts$/,
        loader: 'ts-loader',
        options: { transpileOnly: true }
      }
    ]
  },
  optimization: {
    minimizer: ['...', new CssMinimizerPlugin()]
  },
  plugins: [new HtmlWebPackPlugin(), new MiniCssExtractPlugin({ filename: '[contenthash].css' })]
}
