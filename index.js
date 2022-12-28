const ircClient = require('node-irc');
const modes_names = {0: "osu", 1: "taiko", 2: "fruits", 3: "mania"};
const fs = require('fs');
const {v2, auth, tools} = require('osu-api-extended');
const nodeHtmlToImage = require('node-html-to-image');
const {TwitterApi} = require('twitter-api-v2');
const fetch = require("node-fetch");
const async = require('async');
const sqlite3 = require('sqlite3').verbose();
const pass = JSON.parse(fs.readFileSync('pass.json').toString());
const client = new ircClient('irc.ppy.sh', 6667, pass["ircNickname"], pass["ircFullname"], pass["ircPassword"]);
const twitterClient = new TwitterApi({
    appKey: pass['twitterAppKey'],
    appSecret: pass['twitterSecret'],
    accessToken: pass['twitterAccessToken'],
    accessSecret: pass['twitterAccessSecret']
})
const db = new sqlite3.Database('./webserver/db.sqlite3')
twitterClient.currentUser().then((user) => {
    if (user === undefined) {
        console.log("Twitter login failed"); // i guess xd
        terminate();
    }
})
const login = async () => {
    await auth.login(pass['CLIENT_ID'], pass['CLIENT_SECRET']);
}

function createPlayer(osu) {
    db.serialize(() => {
        db.run("INSERT INTO sniper_osuplayer values ($id, true,false, null, $twitter_handle)", { // mentionable has to be false to comply with Twitter Rules, got suspeneded for it being true :(
            $id: osu.id,
            $twitter_handle: (osu.twitter !== '' || !osu.twitter.includes(" ")) ? osu.twitter : null,
        })
    })
}

async function getPlayer(osu) {
    let resp = await async.parallel([
        function (callback) {
            db.serialize(() => {
                db.get("SELECT * FROM sniper_osuplayer WHERE id=$id", {$id: osu.id}, function (err, row1) {
                    if (row1 === undefined) {
                        createPlayer(osu);
                        getPlayer(osu).then((resp) => {
                            callback(null, resp)
                        })
                    } else {
                        callback(null, row1);
                    }
                });
            });
        }]);
    return resp[0];
}

client.on('ready', function () {
    console.log("Connecting to osu! API...");
    login().then(() => {
        console.log('Connected to osu! API!');
    });
    console.log("Connecting to IRC!");
    client.join("#announce");
});
client.on('CHANMSG', function (data) {
    if (!data.message.includes("achieved rank #1")) {
        return;
    }
    console.log(data.message)
    fs.appendFile('1s.txt', "Time " + Date.now() + " " + data.message + "\n", function (err) {
        if (err) return console.log(err);
        console.log('Saved!: ' + data.message);
    });
    getInfo(data.message).then(async function ({mode, sniper, beatmap, scores, difficulty_rating, bg, pp}) {
        await v2.user.details(scores[1].user.id, modes_names[mode]).then(async (sniped1) => {
            let sniped = sniped1;
            if (scores[0].user.id !== sniper.id) {
                console.log("This score is not a snipe!")
            }

            await async.parallel([
                function (callback) {
                    getPlayer(sniper).then((player) => {
                        callback(null, player);
                    })
                },
                function (callback) {
                    getPlayer(sniped).then((player) => {
                        callback(null, player);
                    })
                }
            ], function (err, results) {
                let sniperobj = results[0];
                let snipedobj = results[1];
                console.log(sniperobj, snipedobj);
                generateImage({mode, sniper, beatmap, sniped, scores, difficulty_rating, sniperobj, snipedobj, bg, pp})
            });
        });
    })
})

const getInfo = async (data) => {
    let mode = parseInt(data.split("?m=")[1].split(" ")[0]);
    let beatmap_id = data.split("http://osu.ppy.sh/b/")[1].split("?")[0];
    let sniper = await v2.user.details(
        data.split("http://osu.ppy.sh/u/")[1].split(" ")[0], modes_names[mode]
    );
    let beatmap = await v2.beatmap.diff(
        beatmap_id
    );
    let scores = (await v2.beatmap.leaderboard(beatmap_id, modes_names[mode])).scores;
    let pp = await v2.scores.details(scores[0].id, modes_names[mode]);
    let difficulty_rating = (scores[0].mods.length > 0) ? (await v2.beatmap.attributes(beatmap_id, {
        mods: scores[0].mods,
        ruleset: modes_names[mode]
    })).attributes.star_rating.toFixed(2) : beatmap.difficulty_rating.toFixed(2);
    const bg = beatmap.beatmapset.covers["cover@2x"];
    return {mode, sniper, beatmap, scores, difficulty_rating, bg, pp};
}

async function generateImage({mode, sniper, beatmap, sniped, scores, difficulty_rating, sniperobj, snipedobj, bg, pp}) {
    console.log(sniper.avatar_url, sniped.avatar_url)
    const read_template = fs.readFileSync('./image/index.html', 'utf8');
    await nodeHtmlToImage({
        output: './rendered.png',
        html: read_template,
        content: {
            sniperusr: sniper.username,
            sniperrank: sniper.statistics.global_rank,
            snipedusr: sniped.username,
            snipedrank: sniped.statistics.global_rank,
            artist: beatmap.beatmapset.artist,
            title: beatmap.beatmapset.title,
            version: beatmap.version,
            pp: Math.round(pp.pp),
            acc: (scores[0].accuracy * 100).toFixed(2),
            star: difficulty_rating,
            mods: (scores[0].mods.length > 0) ? scores[0].mods.join(",") : "none",
            bgImage: bg,
            sniperImage: sniper.avatar_url,
            snipedImage: sniped.avatar_url,
        }
    })
        .then(() => {
            sendTweet(sniper, beatmap, sniped, scores, difficulty_rating, sniperobj, snipedobj, bg, pp)
        })
}

async function sendTweet(sniper, beatmap, sniped, scores, difficulty_rating, sniperobj, snipedobj, bg, pp) {
    const mediaIds = await Promise.all([
        twitterClient.v1.uploadMedia('./rendered.png')
    ])
    await twitterClient.v1.tweet(
        `🔫 ${sniper.username} [#${sniper.statistics.global_rank}] has sniped ${sniped.username} [#${sniped.statistics.global_rank}] on ${beatmap.beatmapset.artist} - ${beatmap.beatmapset.title} [${beatmap.version}] ${difficulty_rating}⭐. This play is worth ${Math.round(pp.pp)}pp getting ${(scores[0].accuracy * 100).toFixed(2)}% accuracy. ${scores[0].mods.length !== 0 ? 'Mods:' + scores[0].mods.join(" ") + ". " : ""}Link to the map: https://osu.ppy.sh/b/${beatmap.id}`, {media_ids: mediaIds})
}

function terminate() {
    db.close();
    process.exit();
}

process.on('SIGINT', () => {
    terminate();
})
process.on('SIGTERM', () => {
    terminate();
})
process.on('SIGQUIT', () => {
    terminate();
})

client.connect();

//TODO:
//remove [#NULL] if someone is unranked (didn't log in after a pp rework)
//calculate pp using tools.calculate - done, need to check
//get bg using tools.calculate - done, need to check