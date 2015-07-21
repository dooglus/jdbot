#!/usr/bin/env node

var request = require('request');

// var url = "https://test.com";
var url = "https://just-dice.com";

var hash = '15ba22bc1fdeb8c55675a116993ada090125316bb0558dae72c0e41310d5abf3'

// process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

login(hash, function(err, cookie) {
    if (err) return console.log('ERROR:', err);
    // console.log(cookie);
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

var socket,
    csrf,
    uid,
    bet_in_progress,
    chance = '49.5',
    stake = '1',
    hilo = 'hi';

function bot(cookie) {
    var transport = 'websocket';
    // var transport = 'polling';

    var inits = 0;

    socket = require("socket.io-client")
    (url, {transports: [transport], extraHeaders: {
        origin: url,
        cookie: cookie
    }});

    socket.on('error', function(err) {
        console.log('caught error');
    });

    socket.on('init', function(data) {
        uid = data.uid;
        if (!inits++) {
            // only do this stuff the first time we connect, not on reconnection
            // console.log(data);
            csrf = data.csrf;
            console.log('connected, uid =', uid);
            // console.log('csrf is', csrf);
            init_readline();
        } else {
            console.log('reconnected');
            // console.log('csrf was', csrf, 'and now is', data.csrf);
            csrf = data.csrf;
        }
    });

    socket.on('chat', function(txt, date) {
        console.log('CHAT', txt);
    });

    socket.on('wins', function(count) {
        console.log('WIN:', count);
        bet_in_progress = false;
    });

    socket.on('losses', function(count) {
        console.log('LOSE:', count);
        bet_in_progress = false;
    });

    socket.on('result', function(result) {
        // result is something like this:
        //
        // { bankroll: '500227.64420698',
        //   bet: '1',
        //   betid: 2409,
        //   bets: '2177',
        //   chance: '49.5',
        //   date: 1437439984,
        //   high: true,
        //   luck: '96.37%',
        //   lucky: 750994,
        //   max_profit: '130001.13',
        //   name: 'derpy (1)',
        //   nonce: 180,
        //   payout: 2,
        //   ret: '2',
        //   this_profit: '+1',
        //   uid: '1',
        //   wagered: '2194.01000000',
        //   win: true,
        //   stats: 
        //    { bets: 2409,
        //      wins: 1158,
        //      losses: 1251,
        //      luck: 2338.4848484848394,
        //      wagered: 2243.84,
        //      profit: -106.24,
        //      commission: 22.264911885550614,
        //      taken: 0,
        //      purse: 26000227.64420698,
        //      cold: 25500000,
        //      balance: 60814.9933333,
        //      sum1: 561042.63754028,
        //      sum2: 561064.90245217 },
        //   investment: 500193.64096390456,
        //   percent: 99.99986921944092,
        //   invest_pft: 193.6409639045596,
        //   balance: '989.70000000',
        //   profit: '-106.31000000' }

        console.log('RESULT:', result.name,
                    '[betid', result.betid + ',',
                    'bets', result.bets + ',',
                    'nonce', result.nonce + ']',
                    'bet', result.bet,
                    'on', result.high ? 'hi' : 'lo',
                    'at', result.chance + '%',
                    'and', result.win ? 'won;' : 'lost;',
                    'profit', result.this_profit);
    });

    socket.on('jderror', function(txt) {
        console.log('ERROR:', txt);
    });

    socket.on('jdmsg', function(txt) {
        console.log('INFO:', txt);
    });

    socket.on('form_error', function(txt) {
        console.log('FORM ERROR:', txt);
    });

    socket.on('login_error', function(txt) {
        console.log('LOGIN ERROR:', txt);
    });

    socket.on('disconnected', function() {
        console.log('socket disconnect');
    });
}

function init_readline() {
    var readline = require('readline').createInterface({
        input: process.stdin, output: process.stdout, terminal: false
    });

    readline.on('line', handle_command);

    readline.on('close', function() {
        console.log('Have a great day!');
        process.exit(0);
    });
}

var last_command;
function handle_command(txt) {
    // hit return to repeat last line
    if (txt === '') {
        if (last_command)
            return handle_command(last_command);
        txt = '.help';
    }

    last_command = txt;

    // lines that don't begin with a dot are sent as if entered in the chat box
    if (!txt.match(/^[.]/)) {
        socket.emit('chat', csrf, txt);
        return;
    }

    txt = txt.substring(1);

    // split command into array of words
    txt = txt.split(/\s+/);

    switch (txt[0]) {

        case 'b':
        case 'bet':
            bet(chance, stake, hilo);
            break;

        case 'c':
        case 'chance':
            chance = tidy(txt[1], 4);
            console.log('set chance to', chance);
            break;

        case 'h':
        case 'hi':
        case 'high':
            hilo = 'hi';
            console.log('set hi/lo to hi');
            break;

        case 'l':
        case 'lo':
        case 'low':
            hilo = 'lo';
            console.log('set hi/lo to lo');
            break;

        case 'p':
        case 'payout':
            chance = tidy(99 / txt[1], 4);
            console.log('set chance to', chance + '%');
            break;

        case 's':
        case 'stake':
            stake = tidy(txt[1], 8);
            console.log('set stake to', stake);
            break;

        case 't':
        case 'tog':
        case 'toggle':
            hilo = 'tog';
            console.log('set hi/lo to toggle');
            break;

        case '?':
        case 'help':
            console.log('type to chat, or (.b)et, (.c)hance, (.h)i, (.l)o, (.p)ayout, (.s)take, (.t)oggle (.help)');
            break;

        default:
            console.log('unknown command;', txt[0]);
            break;
    }
}

function tidy(val, fixed)
{
    if (fixed === undefined)
        fixed=8;

    if (typeof(val) == 'number')
        val = val.toFixed(fixed);

    val = val.replace(/([.].*?)0+$/, '$1'); // remove trailing zeroes after the decimal point
    val = val.replace(/[.]$/, '');          // remove trailing decimal point
    return val;
}

var last_hilo;

function bet(chance, stake, hilo) {
    if (bet_in_progress) {
        console.log('you have a bet in progress already');
        return;
    }

    // if we're toggling, toggle
    if (hilo == 'tog') {
        if (last_hilo == 'hi')
            last_hilo = 'lo';
        else
            last_hilo = 'hi';
    } else
        // else just remember what we bet in case we toggle next time
        last_hilo = hilo;

    console.log('BET:', stake, '@', tidy(chance, 4) + '%', last_hilo);
    bet_in_progress = true;
    socket.emit('bet', csrf, {chance: tidy(chance, 4), bet: tidy(stake), which: last_hilo});
}
