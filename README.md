QQ OAuth for ES6。QQ公共平台OAuth SDK. [api](http://wiki.open.qq.com/wiki/website/OAuth2.0%E7%AE%80%E4%BB%8B)

fork from [co-wechat-oauth](https://github.com/node-webot/co-wechat-oauth)
感谢co-wechat-oauth作者以及所有贡献者!!

## 模块状态

[![NPM version](https://badge.fury.io/js/co-qq-oauth.png)](http://badge.fury.io/js/co-qq-oauth)
[![Build Status](https://travis-ci.org/wanglijie/co-qq-oauth.svg?branch=master)](https://travis-ci.org/wanglijie/co-qq-oauth)

## 功能列表
- OAuth授权
- 获取基本信息

OAuth2.0网页授权，使用此接口须通过QQ认证.

## Installation

```sh
$ npm install co-qq-oauth
```

## Usage

### 初始化
引入OAuth并实例化

```js
var OAuth = require('co-qq-oauth');
var client = new OAuth('your client_id', 'your client_secret');
```

以上即可满足单进程使用。
当多进程时，token需要全局维护，以下为保存token的接口。

```js
var oauthApi = new OAuth('client_id', 'client_secret', function * (uid) {
  // 传入一个根据uid获取对应的全局token的方法
  var txt = yield fs.readFile(uid +':access_token.txt', 'utf8');
  return JSON.parse(txt);
}, function (uid, token) {
  // 请将token存储到全局，跨进程、跨机器级别的全局，比如写到数据库、redis等
  // 这样才能在cluster模式及多机情况下使用，以下为写入到文件的示例
  // 持久化时请注意，每个uid都对应一个唯一的token!
  yield fs.writeFile(uid + ':access_token.txt', JSON.stringify(token));
});
```

### 引导用户
生成引导用户点击的URL。

```js
var url = client.getAuthorizeURL('redirectUrl');
```

### 获取AccessToken
用户点击上步生成的URL后会被重定向到上步设置的 `redirectUrl`，并且会带有`code`参数，我们可以使用这个`code`换取`access_token`

```js
var token = yield client.getAccessToken('code');
var accessToken = token.data.access_token;
```

### 获取用户openid

```js
var userOpenId = yield client.getUserOpenId('accessToken');
```

### 获取用户信息

```js
var user = yield client.getUser('userOpenId');
```

## License
The MIT license.
