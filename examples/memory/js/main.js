// _benchmarkStart(true);

const selectOne = Arrow.bind('click', select.lift()).whileTrue();

const round = Arrow.id()
    .tap(clear)
    .tap(selectOne)
    .tap(selectOne)
    .seq(validate.lift())
    .carry()
    .wait(500)
    .tap(freeze)
    .wait(500);

const game = Arrow.id()
    .tap(round)
    .seq(cardsLeft.lift())
    .whileTrue();

const play = setup.lift()
    .wait(1000)
    .seq(game)
    .seq(won.lift());

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
