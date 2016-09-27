var urllib = require('urllib');
var extend = require('util')._extend;
var querystring = require('querystring');

var AccessToken = function (data) {
  if (!(this instanceof AccessToken)) {
    return new AccessToken(data);
  }
  this.data = data;
};

/*!
 * 检查AccessToken是否有效，检查规则为当前时间和过期时间进行对比
 *
 * Examples:
 * ```
 * token.isValid();
 * ```
 */
AccessToken.prototype.isValid = function () {
  return !!this.data.access_token && (new Date().getTime()) < (this.data.create_at + this.data.expires_in * 1000);
};

/**
 * 根据appid和appsecret创建OAuth接口的构造函数
 * 如需跨进程跨机器进行操作，access token需要进行全局维护
 * 使用使用token的优先级是：
 *
 * 1. 使用当前缓存的token对象
 * 2. 调用开发传入的获取token的异步方法，获得token之后使用（并缓存它）。

 * Examples:
 * ```
 * var OAuth = require('co-qq-oauth');
 * var api = new OAuth('appid', 'secret');
 * ```
 * @param {String} appid 在公众平台上申请得到的appid
 * @param {String} appsecret 在公众平台上申请得到的app secret
 * @param {Generator} getToken 用于获取token的方法
 * @param {Generator} saveToken 用于保存token的方法
 */
var OAuth = function (appid, appsecret, getToken, saveToken) {
  this.appid = appid;
  this.appsecret = appsecret;
  // token的获取和存储
  this.store = {};
  this.getToken = getToken || function * () {
    return this.store['qq_token'];
  };
  if (!saveToken && process.env.NODE_ENV === 'production') {
    console.warn("Please dont save oauth token into memory under production");
  }
  this.saveToken = saveToken || function * (token) {
    this.store['qq_token'] = token;
  };
  this.defaults = {};
};

/**
 * 用于设置urllib的默认options
 *
 * Examples:
 * ```
 * oauth.setOpts({timeout: 15000});
 * ```
 * @param {Object} opts 默认选项
 */
OAuth.prototype.setOpts = function (opts) {
  this.defaults = opts;
};

/*!
 * urllib的封装
 *
 * @param {String} url 路径
 * @param {Object} opts urllib选项
 */
OAuth.prototype.request = function * (url, opts) {
  var options = {};
  extend(options, this.defaults);
  opts || (opts = {});
  for (var key in opts) {
    if (key !== 'headers') {
      options[key] = opts[key];
    } else {
      if (opts.headers) {
        options.headers = options.headers || {};
        extend(options.headers, opts.headers);
      }
    }
  }

  var result;
  try {
    result = yield urllib.requestThunk(url, options);
  } catch (err) {
    err.name = 'QQAPI ' + err.name;
    throw err;
  }

  var data = result.data;

  if (data.errcode) {
    var err = new Error(data.errmsg);
    err.name = 'QQAPI Error';
    err.code = data.errcode;
    throw err;
  }

  return data;
};

/**
 * 获取授权页面的URL地址
 * @param {String} redirect 授权后要跳转的地址
 * @param {String} state 开发者可提供的数据
 */
OAuth.prototype.getAuthorizeURL = function (redirect, state) {
  var url = 'https://graph.qq.com/oauth2.0/authorize';
  this.redirect = redirect
  var info = {
    client_id: this.appid,
    redirect_uri: redirect,
    response_type: 'code',
    state: state || 1
  };

  return url + '?' + querystring.stringify(info) + '#qq_redirect';
};

/*!
 * 处理token，更新过期时间
 */
OAuth.prototype.processToken = function * (data) {
  data.create_at = new Date().getTime();
  // 存储token
  yield this.saveToken(data);
  return AccessToken(data);
};

/**
 * 根据授权获取到的code，换取access token
 *
 * Return:
 * ```
 * {
 *  data: {
 *    "access_token": "ACCESS_TOKEN",
 *    "expires_in": 7200,
 *    "refresh_token": "REFRESH_TOKEN",
 *  }
 * }
 * ```
 * @param {String} code 授权获取到的code
 */
OAuth.prototype.getAccessToken = function * (code) {
  var url = 'https://graph.qq.com/oauth2.0/token';
  var info = {
    client_id: this.appid,
    client_secret: this.appsecret,
    code: code,
    grant_type: 'authorization_code',
    redirect_uri: this.redirect || '/'
  };

  var args = {
    data: info,
    dataType: 'text'
  };

  var data = yield this.request(url, args), _data = {}

  for (var i in data.split('&')) {
    _data[data.split('&')[i].split('=')[0]] = data.split('&')[i].split('=')[1]
  }

  return yield this.processToken(_data);
};

/**
 * 根据refresh token，刷新access token，调用getAccessToken后才有效
 * Examples:
 * ```
 * api.refreshAccessToken(refreshToken);
 * ```
 * Exception:
 *
 * - `err`, 刷新access token出现异常时的异常对象
 *
 * Return:
 * ```
 * {
 *  data: {
 *    "access_token": "ACCESS_TOKEN",
 *    "expires_in": 7200,
 *    "refresh_token": "REFRESH_TOKEN",
 *  }
 * }
 * ```
 * @param {String} refreshToken refreshToken
 */
OAuth.prototype.refreshAccessToken = function * (refreshToken) {
  var url = 'https://graph.qq.com/oauth2.0/token';
  var info = {
    client_id: this.appid,
    client_secret: this.appsecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  };
  var args = {
    data: info,
    dataType: 'text'
  };

  var data = yield this.request(url, args), _data

  for (var i in data.split('&')) {
    _data[data.split('&')[i].split('=')[0]] = data.split('&')[i].split('=')[1]
  }

  return yield this.processToken(data);
};

OAuth.prototype._getUser = function * (options, accessToken) {
  var url = 'https://graph.qq.com/user/get_user_info';
  var info = {
    access_token: accessToken,
    openid: options.openid,
    oauth_consumer_key: this.appid
  };
  var args = {
    data: info,
    dataType: 'json'
  };
  return yield this.request(url, args);
};

/**
 * 根据openid，获取用户信息。
 * 当access token无效时，自动通过refresh token获取新的access token。然后再获取用户信息
 * Examples:
 * ```
 * api.getUser(options);
 * ```
 *
 * Options:
 * ```
 * openId
 * // 或
 * {
 *  "openId": "the open Id", // 必须
 *  "lang": "the lang code" // zh_CN 简体，zh_TW 繁体，en 英语
 * }
 * ```
 * Callback:
 *
 * - `err`, 获取用户信息出现异常时的异常对象
 *
 * Result:
 * ```
 * {
 *  "openid": "OPENID",
 *  "nickname": "NICKNAME",
 *  "sex": "1",
 *  "province": "PROVINCE"
 *  "city": "CITY",
 *  "country": "COUNTRY",
 *  "headimgurl": "http://wx.qlogo.cn/mmopen/g3MonUZtNHkdmzicIlibx6iaFqAc56vxLSUfpb6n5WKSYVY0ChQKkiaJSgQ1dZuTOgvLLrhJbERQQ4eMsv84eavHiaiceqxibJxCfHe/46",
 *  "privilege": [
 *    "PRIVILEGE1"
 *    "PRIVILEGE2"
 *  ]
 * }
 * ```
 * @param {Object|String} options 传入openid或者参见Options
 */
OAuth.prototype.getUser = function * (options) {
  if (typeof options !== 'object') {
    options = {
      openid: options
    };
  }

  var data = yield this.getToken();

  // 没有token数据
  if (!data) {
    var error = new Error('No token for ' + options.openid + ', please authorize first.');
    error.name = 'NoOAuthTokenError';
    throw error;
  }
  var token = AccessToken(data);
  var accessToken;
  if (token.isValid()) {
    accessToken = token.data.access_token;
  } else {
    var newToken = yield this.refreshAccessToken(token.data.refresh_token);
    accessToken = newToken.data.access_token;
  }
  return yield this._getUser(options, accessToken);
};

/**
 * 根据token，获取用户openid。
 * Examples:
 * ```
 * var userOpenId = yield api.getUserOpenId(token);
 * ```
 * Exception:
 *
 * - `err`, 获取用户openid出现异常时的异常对象
 *
 * Result:
 * ```
 * {
 *  "openid": "OPENID",
 *  ...
 * }
 * ```
 * @param {String} token
 */
OAuth.prototype.getUserOpenId = function * (token) {
  var url = 'https://graph.qq.com/oauth2.0/me';
  var info = {
    access_token: token
  };
  var args = {
    data: info,
    dataType: 'text'
  };
  var data = yield this.request(url, args);
  return JSON.parse(data.slice(data.indexOf('{'), data.indexOf('}') + 1)).openid
};

module.exports = OAuth;
