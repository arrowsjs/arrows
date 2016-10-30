// _benchmarkStart(true);

const init = new LiftedArrow(i => {
    /** @arrow :: Number ~> _ */
    $('#music-title').text(songNames[i]);
    $('#music-time').text('Loading...');
});

const checkIfReady = new LiftedArrow(song =>
    /** @arrow :: Elem ~> Bool */
    song.prop('readyState') >= 4
);

const update = new LiftedArrow(song => {
    /** @arrow :: Elem ~> _ */
    $('#music-time').text(
        formatTime(song.prop('currentTime')) + '/' + formatTime(song.prop('duration'))
    );
});

const isPlaying = new LiftedArrow(song =>
    /** @arrow :: Elem ~> Bool */
    song.prop('currentTime') != song.prop('duration')
);

const getSong = new LiftedArrow(i =>
    /* @arrow :: Number ~> Elem */
    $('#music' + i)
);

const load = new LiftedArrow(song => {
    /** @arrow :: Elem ~> _ */
    if (song.prop('readyState') < 4) {
        song.trigger('load');
    }
});

const play = new LiftedArrow(song => {
    /** @arrow :: Elem ~> _ */
    song.trigger('play');
});

const pause = new LiftedArrow(song => {
    /** @arrow :: Elem ~> _ */
    song.trigger('pause');
});

const stop = new LiftedArrow(song => {
    /** @arrow :: Elem ~> _ */
    song.trigger('pause');
    song.prop('currentTime', 0);
});

const incr = new LiftedArrow(i =>
    /* @arrow :: Number ~> Number */
    i >= songNames.length - 1 ? 0 : i + 1
);

const decr = new LiftedArrow(i =>
    /* @arrow :: Number ~> Number */
    i <= 0 ? songNames.length - 1 : i - 1
);

const showPlay = new LiftedArrow(() => {
    $('#music-play').show();
    $('#music-pause').hide();
});

const showPause = new LiftedArrow(() => {
    $('#music-play').hide();
    $('#music-pause').show();
});

const blockUntilLoaded = Arrow.any([
    checkIfReady.seq(Arrow.throwFalse().catch(new DelayArrow(Infinity))).noemit(),
    new EventArrow('canplay canplaythrough')
]);

const showProgress = update.remember()
    .wait(250)
    .seq(isPlaying)
    .whileTrue();

const loadAndPlaySong = init.remember()
    .seq(getSong).tap(load, blockUntilLoaded, play)
    .seq(showProgress)
    .remember()
    .noemit();

const changeSong = Arrow.any([
    getSong.seq(stop).remember().seq(decr).triggeredBy('#music-prev', 'click'),
    getSong.seq(stop).remember().seq(incr).triggeredBy('#music-next', 'click')
]).tap(showPause);

const onPause = getSong.seq(pause).remember().tap(showPlay).seq(Arrow.any([
    showPause.remember().triggeredBy('#music-play', 'click'),
    changeSong
])).triggeredBy('#music-pause', 'click');

_benchmarkResultsOrRun((0).lift().tap(showPause).seq(Arrow.fix(a =>
    Arrow.any([loadAndPlaySong.seq(incr), changeSong, onPause]).seq(a)
)));
