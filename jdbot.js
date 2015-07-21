#!/usr/bin/env node

// set to 'false' to connect to the real just-dice.com server
var testing = (process.env.JDBOT_TESTING != '0');

var request = require('request');

var url = testing ? "https://test.com" : "https://just-dice.com";

// EITHER (A) call login_then_run_bot() with your 64 character hash:
login_then_run_bot(process.env.JDBOT_HASH);

// OR (B) as a shortcut, call run_bot() with your full hash+sid cookie (as shown when you use login_then_run_bot()) to skip the login step:
// cookie = 'hash=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef; connect.sid=s%3AAAAAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAA%AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
// run_bot(cookie);

var version = '0.1.3',
    socket,
    csrf,
    uid,
    balance,
    max_profit,
    bet_in_progress,
    chance = '49.5',
    stake = '1',
    hilo = 'hi',
    bet_stake_threshold = 1,
    bet_profit_threshold = 1,
    show_all_my_bets = true,
    user_profit = {};

//// ignore broken site certificate on test box
if (testing)
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

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

    try {
        switch (txt[0]) {

            case 'b':
            case 'bet':
                bet(chance, stake, hilo);
                break;

            case 'c':
            case 'chance':
                validate_number(txt[1]);
                chance = tidy(txt[1], 4);
                console.log('set chance to', chance + '%');
                break;

            case 'd':
            case 'deposit':
                socket.emit('deposit', csrf);
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

            case 'n':
            case 'name':
                validate_string(txt[1]);
                console.log('attempting to change name to "' + txt[1] + '"');
                socket.emit('name', csrf, txt[1]);
                break;

            case 'p':
            case 'payout':
                validate_number(txt[1]);
                chance = tidy(99 / txt[1], 4);
                console.log('set chance to', chance + '%');
                break;

            case 's':
            case 'stake':
                validate_number(txt[1]);
                stake = tidy(txt[1], 8);
                console.log('set stake to', stake);
                break;

            case 't':
            case 'tog':
            case 'toggle':
                hilo = 'tog';
                console.log('set hi/lo to toggle');
                break;

            case 'w':
            case 'wd':
            case 'withdraw':
                validate_address(txt[1]);
                validate_number(txt[2]);
                console.log('withdrawing', txt[2], 'to', txt[1]);
                socket.emit('withdraw', csrf, txt[1], txt[2], txt[3]);
                break;

            case '?':
            case 'help':
                show_help();
                break;

            default:
                console.log('unknown command;', txt[0]);
                break;
        }
    } catch (err) {
        console.log(err);
    }
}

function validate_address(addr) {
    if (addr === undefined)
        throw new Error("missing required address");

    if (!addr.match(/^x[1-9a-km-zA-HJ-NP-Z]{33}$/))
        throw new Error("invalid CLAM address");
}

function validate_number(num) {
    if (num === undefined)
        throw new Error("missing required number");

    if (!num.match(/[0-9]/))
        throw new Error("number should have some digits in it");

    if (num.match(/[.].*[.]/))
        throw new Error("number should have no more than one dot in it");

    if (!num.match(/^[0-9.]*$/))
        throw new Error("number should have nothing other than digits and dots in it");
}

function validate_string(str) {
    if (str === undefined)
        throw new Error("missing required string");
}

function show_news(news) {
    console.log('NEWS:', news);
}

function show_help() {
    console.log('type to chat, or (.b)et, (.c)hance, (.d)eposit, (.h)i, (.l)o, (.n)ame (.p)ayout, (.s)take, (.t)oggle (.w)ithdraw (.help)');
    console.log('hit return on its own to repeat last line');
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

function login_then_run_bot(hash) {
    login(hash, function(err, cookie) {
        if (err) {
            console.log('ERROR:', err);
            return;
        }

        console.log('logged in; got cookie (secret - do not share!):');
        console.log(cookie);
        run_bot(cookie);
    });
}

function login(hash, cb) {
    var jar = request.jar();

    request.get({
        url: url + '/' + hash,
        // form: {nick: 'secret_user', password: 'yourpassword'},
        jar: jar
    }, function(err, res, body) {
        if (err)
            return cb(err);

        var cookie = jar.getCookieString(url);

        if (!cookie.match(/hash=/))
            return cb('bad hash');

        return cb(null, cookie);
    });
}

function run_bot(cookie) {
    show_help();

    var transport = 'websocket';
    // var transport = 'polling';

    var inits = 0;

    socket = require("socket.io-client")
    (url, {transports: [transport], extraHeaders: {
        origin: url,
        cookie: cookie
    }});

    socket.on('getver', function(key) {
        socket.emit('version', csrf, key, "jdbot:" + version);
    });

    socket.on('error', function(err) {
        console.log('caught error:', err);
    });

    socket.on('news', function(news) {
        show_news(news);
    });

    socket.on('staked', function(dat) {
        var ourstake = dat.stake_pft ? '; your share = ' + tidy(dat.stake_share) + '; your total = ' + tidy(dat.stake_pft) + '' : '';
        console.log('STAKED: we just staked', tidy(dat.stake), '(total =', tidy(dat.total) + ourstake + ')');
    });

    socket.on('init', function(data) {
        uid = data.uid;
        if (!inits++) {
            // only do this stuff the first time we connect, not on reconnection

            // data is something like this:
            //
            // { api: 0,
            //   balance: '988.00000000',
            //   bankroll: '500215.49619137',
            //   bet: 0.5,
            //   bets: '2474',
            //   chance: 33,
            //   chat: 
            //    [ '{"user":"1243","name":"tammie","txt":"chat text 1"}',
            //      '1437445872584',
            //      '{"user":"1","name":"@derpy","txt":"etc."}',
            //      '1437452160715',
            //      '{"user":"1","name":"@derpy","txt":"etc.}',
            //      '1437452172081' ],
            //   csrf: 'f68wiCdKcdf6',
            //   edge: 1,
            //   fee: 0.001,
            //   ga: { active: false, failures: 0, last: '327860', ok: 1437123260013 },
            //   ignores: [],
            //   investment: 500181.4929641858,
            //   invest_pft: 181.49296418577433,
            //   login: '<p>You can log into the same account from a different computer or browser using <a href="/e47004523222720bdf835f741505f7acd9d7ead728893b65fd4ac59b07a33a20">this link</a>.<br/>Protect this secret link as it can be used to access your account balance.</p><p>If you prefer to use a more traditional and secure approach then<button id="setup_account">set up a username and password</button>.</p>',
            //   losses: '1305',
            //   luck: '96.28%',
            //   max_profit: '130001.07',
            //   name: 'dooglus',
            //   news: 'no news is set',
            //   nonce: '477',
            //   offsite: 25500000,
            //   percent: 99.99986921944092,
            //   profit: '-108.01000000',
            //   seed: '770695475991960934442523',
            //   settings: 
            //    { max_bet: 1,
            //      chat_watch_player: null,
            //      alert_words: 'dooglus',
            //      alert: 1,
            //      hilite: 1,
            //      pmding: 1,
            //      chat_min_risk: 1,
            //      chat_min_change: 1,
            //      styleme: 1 },
            //   shash: 'bf7feb2c04020f94262d9f01fa62fa4ce527e58f357372969ccb46c2ab85d3ed',
            //   stake_pft: 98.6989727076143,
            //   uid: '1',
            //   username: null,
            //   wagered: '2295.81000000',
            //   wins: '1169',
            //   stats: 
            //    { bets: '3315',
            //      wins: 1542,
            //      losses: 1773,
            //      luck: 3217.2707228742447,
            //      wagered: 2824.9700003,
            //      profit: -94.09198439,
            //      commission: 22.264911885550614,
            //      taken: 0,
            //      purse: 26000215.49619137,
            //      cold: 25500000,
            //      balance: 60827.14134891,
            //      sum1: 561042.63754028,
            //      sum2: 561064.90245217 },
            //   wdaddr: '' }

            csrf = data.csrf;
            balance = data.balance;
            max_profit = data.max_profit;
            console.log('connected as (' + uid + ') <' + data.name + '>');
            show_news(data.news);
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

    // this triggers when we win a bet
    socket.on('wins', function(count) {
        // console.log('WIN:', count);
        bet_in_progress = false;
    });

    // this triggers when we lose a bet
    socket.on('losses', function(count) {
        // console.log('LOSE:', count);
        bet_in_progress = false;
    });

    // this triggers for every bet the server tells us about; they're not all ours
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

        var this_profit = parseFloat(result.this_profit);

        if (user_profit[result.uid] === undefined)
            user_profit[result.uid] = 0;

        user_profit[result.uid] += this_profit;
        if ((show_all_my_bets && result.uid == uid) || this_profit >= bet_profit_threshold || result.bet >= bet_stake_threshold)
            console.log('RESULT:', result.name,
                        '[betid', result.betid + ',',
                        'bets', result.bets + ',',
                        'nonce', result.nonce + ']',
                        'bet', result.bet,
                        'on', result.high ? 'hi' : 'lo',
                        'at', result.chance + '%',
                        'and', result.win ? 'won;' : 'lost;',
                        'profit', result.this_profit,
                        'cumulative profit', user_profit[result.uid]);

        max_profit = result.max_profit;
        if (result.uid == uid) {
            // console.log("that's me!");
            balance = result.balance;
        }
    });

    socket.on('address', function(addr, img, confs) {
        console.log('DEPOSIT:', addr);
    });

    socket.on('invest_error', function(txt) {
        console.log('ERROR:', txt);
    });

    socket.on('divest_error', function(txt) {
        console.log('ERROR:', txt);
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

    socket.on('balance', function(data) {
        balance = data;
        console.log('BALANCE:', balance);
    });

    socket.on('max_profit', function(mp) {
        max_profit = mp;
        console.log('MAX PROFIT:', max_profit);
    });

    socket.on('disconnect', function() {
        console.log('disconnected');
    });
}
