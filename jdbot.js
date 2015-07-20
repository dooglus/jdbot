#!/usr/bin/env node

var request = require('request');

// var url = "https://test.com";
var url = "https://just-dice.com";

var hash = 'e47004523222720bdf835f741505f7acd9d7ead728893b65fd4ac59b07a33a20'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

login(hash, function(err, cookie) {
    if (err) return console.log('ERROR:', err);
    console.log(cookie);
    bot(cookie);
});

function login(hash, cb) {
    var jar = request.jar();

    request.get({
        url: url + '/' + hash,
        // form: {nick: 'secret_user', password: 'yourpassword'},
        jar: jar
    }, function(err, res, body) {
        if (err) return cb(err);
        return cb(null, jar.getCookieString(url));
    });
}

function bot(cookie) {
    var io = require("socket.io-client")(url, {transports: ['websocket'], extraHeaders: {origin: url, cookie: cookie}});

    var inits = 0;
    io.on('init', function(data) {
        console.log('socket init');
        inits++;
        if (inits == 1) {
            // only do this stuff the first time we connect, not on reconnection
        }
    });

    io.on('chat', function(txt, date) {
        console.log('chat', txt);
    });

    io.on('disconnect', function() {
        console.log('socket disconnect');
    });
}
