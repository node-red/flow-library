var settings = require("../config");
var path = require("path");

function formatDate(dateString) {
    var now = Date.now();
    var d = new Date(dateString);
    var delta = now - d.getTime();

    delta /= 1000;

    if (delta < 60) {
        return "seconds ago";
    }

    delta = Math.floor(delta/60);

    if (delta < 10) {
        return "minutes ago";
    }
    if (delta < 60) {
        return delta+" minutes ago";
    }

    delta = Math.floor(delta/60);

    if (delta < 24) {
        return delta+" hour"+(delta>1?"s":"")+" ago";
    }

    delta = Math.floor(delta/24);

    if (delta < 7) {
        return delta+" day"+(delta>1?"s":"")+" ago";
    }
    var weeks = Math.floor(delta/7);
    var days = delta%7;

    if (weeks < 4) {
        if (days === 0) {
            return weeks+" week"+(weeks>1?"s":"")+" ago";
        } else {
            return weeks+" week"+(weeks>1?"s":"")+", "+days+" day"+(days>1?"s":"")+" ago";
        }
    }

    var months = Math.floor(weeks/4);
    weeks = weeks%4;

    if (months < 12) {
        if (weeks === 0) {
            return months+" month"+(months>1?"s":"")+" ago";
        } else {
            return months+" month"+(months>1?"s":"")+", "+weeks+" week"+(weeks>1?"s":"")+" ago";
        }
    }

    var years = Math.floor(months/12);
    months = months%12;

    if (months === 0) {
        return years+" year"+(years>1?"s":"")+" ago";
    } else {
        return years+" year"+(years>1?"s":"")+", "+months+" month"+(months>1?"s":"")+" ago";
    }

}

function formatShortDate(d) {
    var delta = Date.now() - (new Date(d)).getTime();
    delta /=1000;
    var days = Math.floor(delta / (60*60*24));
    var weeks = Math.floor(days/7);
    var months = Math.floor(weeks/4);
    var years = Math.floor(months/12);
    if (days < 7) {
        return days+"d";
    } else if (weeks < 4) {
        return weeks+"w";
    } else if (months < 12) {
        return months+"m";
    } else {
        months = months % 12;
        if (months > 0) {
            return years+"y "+months+"m";
        }
        return years+"y";
    }
}
function mapGistPath(file) {
    if (file.indexOf(settings.gistDir) == -1) {
        var m = /^.*\/gists\/(.*)$/.exec(file);
        return path.join(settings.gistDir,m[1]);
    }
    return file;
}
function mapNodePath(file) {
    if (!file) {
        return;
    }
    if (file.indexOf(settings.nodeDir) == -1) {
        var m = /^.*\/nodes\/(.*)$/.exec(file);
        return path.join(settings.nodeDir,m[1]);
    }
    return file;
}

module.exports = {
    formatDate: formatDate,
    formatShortDate: formatShortDate,
    mapGistPath:mapGistPath,
    mapNodePath:mapNodePath
};
