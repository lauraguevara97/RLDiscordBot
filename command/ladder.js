var consts = require('../consts.js');
var db = require('../db.js');
var formatting = require('../formatting.js');
var rlClient = require('../rlClient.js');

var logger = require('winston');

/**
 * Ladder command, !ladder <playlist>
 * Finds all ranked people in the playlist, and shows their cached results them in order.
 */
function run(discordName, discordID, message, args) {
    var playlists = formatting.parsePlaylistArgs(args);
    if (playlists.length != 1) {
        message.channel.send("A single playlist must be provided.");
        return;
    }
    var playlist = playlists[0];
    var rlPlaylist = rlClient.playlistNameToID(playlist);

    // First step, load all the users:
    db.User.find(function (err, users) {
        if (err) {
            logger.error("Error loading users.");
            return;
        }
        var userMap = {};
        var batchPayload = [];
        for (user of users) {
            userMap[user['steamId']] = user;
            batchPayload.push({"platformId": user.platform, "uniqueId": user.steamId});
        }

        // Next step, query for all their ranks in one go:
        rlClient.getStatsBatch(batchPayload).then(
            function (userRatings) {
                var rankedRatings = [];
                for (var userRating of userRatings) {
                    // Need rating from RL API...
                    var rating = userRating
                        && userRating.rankedSeasons
                        && userRating.rankedSeasons[consts.CurrentSeason]
                        && userRating.rankedSeasons[consts.CurrentSeason][rlPlaylist];
                    // ... and user from Discord
                    var user = userMap[userRating.uniqueId];
                    if (user && rating) {
                        rankedRatings.push({
                            'user': user,
                            'data': rating,
                        });
                    }
                }
                // Finally, sort by MMR and format the final message:
                rankedRatings.sort(function (a, b) {
                    if (a.data.rankPoints != b.data.rankPoints) {
                        // Highest MMR name first.
                        return b.data.rankPoints - a.data.rankPoints;
                    } else {
                        // Then lowest name.
                        return a.user.name.localeCompare(b.user.name);
                    }
                });
                var text = formatting.ladderToText(rankedRatings);
                message.channel.send({
                    embed: {
                        color: consts.Color.GREEN,
                        title: "Current ladder for " + playlist + ": ",
                        description: text
                    }
                });
            }
        ).catch(function (err) {
            message.channel.send({
                embed: {
                    color: consts.Color.RED,
                    title: "Couldn't load rankings, try again later"
                }
            });
        })
    });
}

module.exports = {
    run: run
};
