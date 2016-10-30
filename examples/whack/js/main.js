// _benchmarkStart(true);

const checkHits = new LiftedArrow(function() {
    /* @arrow _ ~> _ \ ({}, {_}) */
    if (hits >= 10) {
        throw null;
    }
});

const random = new LiftedArrow(function() {
    /* @arrow :: _ ~> Number */
    return randomTimeout();
});

const show = new LiftedArrow(function(hole) {
    /* @arrow :: Elem ~> _ */
    hole.flip(true);
});

const hide = new LiftedArrow(function(hole) {
    /* @arrow :: Elem ~> _ */
    hole.flip(false);
});

const randomDelay = Arrow.seq([
    random,
    new DynamicDelayArrow(),
]).remember();

function popup(selector) {
    return Arrow.seq([
        checkHits,
        randomDelay,
        new ElemArrow(selector),
        show.remember(),
        Arrow.any([
            randomDelay,

            Arrow.seq([
                new EventArrow('click'),
                hit.lift()
            ]).remember()
        ]),
        hide
    ]).forever();
}

const play = Arrow.seq([
    setup.lift(),
    hideAll.lift(),

    Arrow.catch(Arrow.seq([
        Arrow.any([
            Arrow.fanout([
                popup('#hole1'), popup('#hole2'), popup('#hole3'),
                popup('#hole4'), popup('#hole5'), popup('#hole6'),
                popup('#hole7'), popup('#hole8'), popup('#hole9')
            ]).noemit(),

            lost.lift().after(15000)
        ])
    ]), won.lift()),

    showAll.lift()
]);

function setEnabled(enabled) {
    return new LiftedArrow(button => {
        /* @arrow :: Elem ~> _ */
        button.prop('disabled', !enabled);
    });
}

function startWhenPressed(elem, arrow) {
    return new ElemArrow(elem).on('click', Arrow.id()
        .tap(new NthArrow(1).seq(setEnabled(false)))
        .tap(arrow)
        .tap(new NthArrow(1).seq(setEnabled(true)))
    ).forever();
}

_benchmarkResultsOrRun(startWhenPressed('#play', play));
