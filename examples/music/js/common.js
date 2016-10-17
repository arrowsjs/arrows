function formatTime(duration) {
    if (!duration) {
        return '-:--';
    }

    duration = Math.round(duration);
    var mins = Math.floor(duration / 60);
    var secs = duration % 60;

    return mins + ':' + (secs < 10 ? '0' : '') + secs;
}

function initAudio() {
    for (var i = 0; i < songNames.length; i++) {
        var audio = $('<audio />').attr({ 'preload': 'none', 'id': 'music' + i });

        for (var j = 0; j < typeExt.length; j++) {
            var source = $('<source />').attr({
                'type': 'audio/' + typeExt[j],
                'src': baseUrl + songNames[i] + '.' + typeExt[j]
            });

            audio.append(source);
        }

        $('#songs').append(audio);
    }
}

$(document).ready(() => {
    initAudio();
});
