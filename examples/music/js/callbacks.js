var currentSong = 0;

function loadAndPlayAudio() {
    var song = getSong();

    $('#music-title').text(songNames[currentSong]);

    if (song.prop('readyState') < 4) {
        song.one('canplay canplaythrough', () => {
            showProgress();
            playAudio();
        });

        $('#music-time').text('Loading...');
        song.trigger('load');
    } else {
        playAudio();
    }
}

function playAudio() {
    var song = getSong();

    $('#music-play').hide();
    $('#music-pause').show();
    song.on('progress', showProgress);
    song.trigger('play');
}

function pauseAudio() {
    var song = getSong();

    $('#music-play').show();
    $('#music-pause').hide();
    song.off('progress');
    song.trigger('pause');
}

function stopAudio() {
    pauseAudio();
    getSong().prop('currentTime', 0);
}

function prevSong() {
    stopAudio();

    if (currentSong == 0) {
        currentSong = songNames.length - 1;
    } else {
        currentSong--;
    }

    loadAndPlayAudio();
}

function nextSong() {
    stopAudio();

    if (currentSong == songNames.length - 1) {
        currentSong = 0;
    } else {
        currentSong++;
    }

    loadAndPlayAudio();
}

function getSong() {
    return $('#music' + currentSong);
}

function showProgress() {
    var song = getSong();
    var current = song.prop('currentTime');
    var duration = song.prop('duration');

    if (current == duration) {
        nextSong();
    } else {
        $('#music-time').text(formatTime(current) + '/' + formatTime(duration));
    }
}

$(document).ready(() => {
    loadAndPlayAudio();

    $('#music-play').click(loadAndPlayAudio);
    $('#music-pause').click(pauseAudio);
    $('#music-prev').click(prevSong);
    $('#music-next').click(nextSong);
});
