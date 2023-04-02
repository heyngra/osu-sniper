const irc = require('irc-upd');
const modes_names = {0: "osu", 1: "taiko", 2: "fruits", 3: "mania"};
const fs = require('fs');
const {v2, auth, tools} = require('osu-api-extended');
const nodeHtmlToImage = require('node-html-to-image');
const {TwitterApi} = require('twitter-api-v2');
const express = require('express');
require('express-async-errors');
const cookieParser = require('cookie-parser');
const async = require('async');
const request_1 = require("osu-api-extended/dist/utility/request");
const admZip = require("adm-zip");
const sqlite3 = require('sqlite3').verbose();
const pass = JSON.parse(fs.readFileSync('pass.json').toString());
const client = new irc.Client('irc.ppy.sh', pass["ircNickname"], {
    port: 6667,
    username: pass["ircFullname"],
    password: pass["ircPassword"],
    autoRejoin: true,
    autoConnect: true,

});
const twitterClient = new TwitterApi({
    appKey: pass['twitterAppKey'],
    appSecret: pass['twitterSecret'],
    accessToken: pass['twitterAccessToken'],
    accessSecret: pass['twitterAccessSecret']
})
const db = new sqlite3.Database('./webserver/db.sqlite3')

const app = express();

let base_osu_auth_token, lazer_auth_token = null;

twitterClient.currentUser().then((user) => {
    if (user === undefined) {
        console.log("Twitter login failed"); // i guess xd
        terminate();
    }
})
const login = async () => {
    let resp = await auth.login(pass['CLIENT_ID'], pass['CLIENT_SECRET']);
    base_osu_auth_token = resp.access_token;
    console.log("Current osu! session expires in " + resp.expires_in + " seconds");
    let resp2 = await auth.login_lazer(pass['username'], Buffer.from(pass['password'], "base64").toString("ascii"));
    console.log("osu!lazer session expires in " + resp2.expires_in + " seconds");
    lazer_auth_token = resp2.access_token;
    auth.set_v2(base_osu_auth_token);
    setTimeout(login, resp.expires_in * 999); //999 instead of 1000 to be sure it relogs
}

/**
 * @param table - table name
 * @param column - column name
 * @param value - value to set
 * @param where - nullable, where statement, syntax: "WHERE ... = ..."
 * @param limit - nullable, limit statement, syntax: "LIMIT ..."
 */
function updateDb(table, column, value, where, limit) {
    db.serialize(() => {
        db.run(`UPDATE ${table} SET ${column} = ${value} ${(where!==undefined) ? where : ""} ${(limit!==undefined?limit:"")}`);
    })
}


function createPlayer(osu) {
    db.serialize(() => {
        db.run("INSERT INTO sniper_osuplayer values ($id, true,false, null, $twitter_handle)", { // mentionable has to be false to comply with Twitter Rules, got suspeneded for it being true :(
            $id: osu.id,
            $twitter_handle: (osu.twitter !== '' || !osu.twitter.includes(" ")) ? osu.twitter : null,
        })
    })
}

function createScore(sniper, sniped, beatmap, scores) {
    db.serialize(() => {
        db.run("INSERT INTO sniper_snipes values ($sniper_id, $sniped_id, $beatmapset_id, $beatmap_id, $score_id, $hasreplay, $sniped_score_id, null)", {
            $sniper_id: sniper.id,
            $sniped_id: sniped.id,
            $beatmapset_id: beatmap.beatmapset_id,
            $beatmap_id: beatmap.id,
            $score_id: scores[0].id,
            $hasreplay: scores[0].replay,
            $sniped_score_id: scores[1].id
        })
    })
}

async function getScoreIfValid(scores, sniper, sniped) {
    let resp = await async.parallel([
        function (callback) {
            db.serialize(() => {
                db.all("SELECT * FROM sniper_snipes WHERE sniper = $sniper AND sniped_score_id = $sniped_score", {
                    $sniper: sniper.id,
                    $sniped_score: scores[1].id
                }, (err, rows) => {
                    if (err) {
                        console.log(err)
                    }
                    if (rows.length === 0) {
                        callback(null, {"resnipe": false});
                    } else {
                        callback(null, {"resnipe": true, "snipe": rows[rows.length-1]});
                    }
                })
            })
        }
    ]);
    return resp[0];
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

client.addListener('registered', function (message) {
    console.log("Connecting to osu! API...");
    login().then(() => {
        console.log('Connected to osu! API!');
    });
    console.log("Connecting to IRC!");
    client.join("#announce");
});
client.addListener('message#announce', function (from, message) {
    console.log(message);
    if (!message.includes("achieved rank #1")) {
        return;
    }
    fs.appendFile('1s.txt', "Time " + Date.now() + " " + message + "\n", function (err) {
        if (err) return console.log(err);
        console.log('Saved!: ' + message);
    });
    getInfo(message).then(async function ({mode, sniper, beatmap, scores, difficulty_rating, bg, pp}) {
        if (scores.length === 1) {
            console.log("This score is a first score on a map, so it's not a snipe");
            return;
        }
        await v2.user.details(scores[1].user.id, modes_names[mode]).then(async (sniped1) => {
            let sniped = sniped1;
            if (scores[0].user.id !== sniper.id) {
                console.log("This score is not a snipe!")
                return;
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
                console.log("test");
                getScoreIfValid(scores, sniperobj, snipedobj).then((resp) => {
                    console.log(sniperobj, snipedobj);
                    generateImage({mode, sniper, beatmap, sniped, scores, difficulty_rating, sniperobj, snipedobj, bg, pp, resp})
                })
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

async function generateImage({mode, sniper, beatmap, sniped, scores, difficulty_rating, sniperobj, snipedobj, bg, pp, resp}) {
    console.log(sniper.avatar_url, sniped.avatar_url)
    const read_template = fs.readFileSync('./image/index.html', 'utf8');
    let finished = false;
    let pupeeteerArgs = (pass['chromePath'] !== null) ? {
        headless: 0,
        executablePath: pass['chromePath'],
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--use-gl=swiftshader',
            '--mute-audio',
            '--disable-breakpad',
            '--disable-canvas-aa',
            '--disable-2d-canvas-clip-aa',
            '--no-zygote',
            '--disable-gpu',
        ],} : null;
    try {
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
            },
            puppeteerArgs: pupeeteerArgs
        })
            .then(() => {
                finished = true;
                createScore(sniper, sniped, beatmap, scores);
                console.log(scores[0].replay)
                if (scores[0].replay) {
                    downloadReplay({
                        sniper,
                        beatmap,
                        sniped,
                        scores,
                        difficulty_rating,
                        sniperobj,
                        snipedobj,
                        bg,
                        pp,
                        resp
                    })
                } else {
                    sendTweet(sniper, beatmap, sniped, scores, difficulty_rating, sniperobj, snipedobj, bg, pp, resp)
                }
            })
            .catch(error => {
                console.error('Oops, something went wrong!', error);
            });
    } catch (e) {
        console.log(e)
        generateImage({mode, sniper, beatmap, sniped, scores, difficulty_rating, sniperobj, snipedobj, bg, pp, resp})
    }
}

async function downloadReplay({sniper, beatmap, sniped, scores, difficulty_rating, sniperobj, snipedobj, bg, pp, resp}) {
    auth.set_v2(lazer_auth_token);

    v2.user.me.download.quota().then((quota) => {
        console.log(quota);
    });


    async function downloadBeatmap(beatmap) {
        let beatmapset_name = `${beatmap.beatmapset.id} ${beatmap.beatmapset.artist} - ${beatmap.beatmapset.title}`;
        beatmapset_name = beatmapset_name.replace(/[\/\\:\*\?"<>\|]/g, ''); //remove illegal characters
        if (fs.existsSync(__dirname+"/rewind/Songs/"+beatmapset_name)) {
            console.log("Beatmap already exists, skipping download");
            return;
        } else if (fs.existsSync(__dirname))
        console.log("Downloading beatmap");
        await v2.beatmap.download(beatmap.beatmapset.id, __dirname+"/rewind/tempSongs/"+beatmapset_name+".zip").then((path) => {
            console.log("Downloaded beatmap zip to "+path);
            const zip = new admZip(path);
            zip.extractAllTo(__dirname+"/rewind/Songs/"+beatmapset_name)
            console.log("Beatmap unzipped!")
            if(fs.existsSync(path))fs.unlinkSync(path);
            console.log("Beatmap zip removed!");
        });
    }
    async function downloadScore(score) {
        v2.scores.download(score.id, "osu", __dirname+"/rewind/tempReplays/"+scores[0].id.toString()+".osr").then((path) => {
            fs.renameSync(path, __dirname+"/rewind/Replays/"+score.id.toString()+".osr");
        })
    }
    await async.series([
        function(callback) {
            downloadBeatmap(beatmap);
            callback(null);
        },
        function(callback) {
            downloadScore(scores[0]);
            callback(null);
        }
    ], function(err) {
        if (err) {console.log(err)}
        auth.set_v2(base_osu_auth_token);
        sendTweet(sniper, beatmap, sniped, scores, difficulty_rating, sniperobj, snipedobj, bg, pp, resp)
    });

}

async function sendTweet(sniper, beatmap, sniped, scores, difficulty_rating, sniperobj, snipedobj, bg, pp, resp) {
    const mediaIds = await Promise.all([
        twitterClient.v1.uploadMedia('./rendered.png')
    ])
    let tweetContentBase = `🔫 ${sniper.username} [#${sniper.statistics.global_rank}] has sniped ${sniped.username} [#${sniped.statistics.global_rank}] on ${beatmap.beatmapset.artist} - ${beatmap.beatmapset.title} [${beatmap.version}] ${difficulty_rating}⭐. This play is worth ${Math.round(pp.pp)}pp getting ${(scores[0].accuracy * 100).toFixed(2)}% accuracy. ${scores[0].mods.length !== 0 ? 'Mods:' + scores[0].mods.join(" ") + ". " : ""}`
    let linkPart = `🎮 Link to the map: https://osu.ppy.sh/b/${beatmap.id} ${(scores[0].replay)?"\n📹 Replay: https://replay.heyn.live/?scoreId="+scores[0].id:""}`
    if (tweetContentBase.length>=280) {
        const tweetsContentText = tweetContentBase.match(/.{1,280}(?:\s|$)/g);
        const tweetsContent = []
        for (const twt of tweetsContentText) {
            tweetsContent.push({status: twt})
        }
        tweetsContent[0].media_ids = mediaIds;
        const tweets = await twitterClient.v1.tweetThread(
            [tweetsContent, {
                status: linkPart
            }]
        )
        updateDb("sniper_snipes", "tweet_id", tweets[0].id, "WHERE score_id=" + scores[0].id)
    }
    else {
        const tweet = await twitterClient.v1.tweetThread(
            [{status: tweetContentBase, media_ids: mediaIds},{status: linkPart}]
        )
        updateDb("sniper_snipes", "tweet_id", tweet[0].id, "WHERE score_id=" + scores[0].id)
    }
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

app.set('view engine', 'ejs');

app.engine('html', require('ejs').renderFile);

app.set('views', __dirname + '/webserver');

app.use(express.static(__dirname + '/webserver/staticfolder'));

app.use(cookieParser(pass["cookieSecret"]));

app.use(express.json())

app.get("/login", function (req, res) {
    let authCode = req.query.code;
    if (authCode) {
        request_1.request('https://osu.ppy.sh/oauth/token', {
            method: 'POST',
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            data: JSON.stringify({
                grant_type: 'authorization_code',
                client_id: parseInt(pass["CLIENT_ID"]),
                client_secret: pass["CLIENT_SECRET"],
                redirect_uri: pass['redirect_uri'],
                code: authCode,
            })
        }).then(({access_token, expires_in}) => {
            res.cookie('osu_token', access_token, {maxAge: expires_in * 1000});
            res.redirect('/');
        });
    } else {
        res.redirect('/');
    }

});

app.get('/', async function (req, res) {
    if (!req.cookies["osu_token"]) {
        res.render('index.html');
    } else {
        auth.cache_v2 = req.cookies["osu_token"];
        let user = await v2.user.me.details("osu");
        auth.cache_v2 = base_osu_auth_token;
        let user_obj = await getPlayer(user);
        res.render('logged.ejs', {user: user, obj: user_obj});
    }
});

app.post('/changesnipe', async function (req, res) {
    if (!req.cookies["osu_token"]) {
        res.sendStatus(401);
    } else {
        auth.cache_v2 = req.cookies["osu_token"];
        let user = await v2.user.me.details("osu");
        auth.cache_v2 = base_osu_auth_token;
        console.log(req.body);
        updateDb("sniper_osuplayer", "snipable", req.body['snipe'], "WHERE id = " + user.id);
        res.status(200).json({"status": "Success!"});
    }
})

app.post('/logout', function (req, res) {
    res.clearCookie('osu_token');
    res.status(200).json({"status": "Logged out!"});
})
app.listen(6120);

//TODO:
//remove [#NULL] if someone is unranked (didn't log in after a pp rework)
//make snipes not spam (if someone oversnipes himself)
