const NUM_ITEMS = 15;
const ANIMATION = 75;
const ANIMATION_PARTIAL = 3 * ANIMATION / 4;

for (var i = 0; i < NUM_ITEMS; i++) {
    $('#sort-div').append($('<div />').css({
        'top': i * 8 + 'px',
        'width': (i + 1) * 2 + 'ex'
    }));
}

//
// Utility Functions
//

function swap() {
    var swapping = $('.swapping');

    if (swapping.length == 2) {
        var c1 = swapping.eq(0).clone();
        var c2 = swapping.eq(1).clone();
        swapping.eq(0).replaceWith(c2);
        swapping.eq(1).replaceWith(c1);

        c1.animate({ top: c2.css('top') }, ANIMATION_PARTIAL);
        c2.animate({ top: c1.css('top') }, ANIMATION_PARTIAL);
    }
}

const indent = () => $('.swapping').animate({ 'margin-left': 20 }, ANIMATION_PARTIAL);
const dedent = () => $('.swapping').animate({ 'margin-left':  0 }, ANIMATION_PARTIAL);

function clear() {
    $('#sort-div').children().removeClass('looking');
    $('#sort-div').children().removeClass('swapping');
}

function setEnabled(flag) {
    return new LiftedArrow(() => {
        $('#sort').prop('disabled', !flag);
        $('#shuffle').prop('disabled', !flag);
    });
}

//
// Annotated (Lifted) Functions
//

function initShuffle() {
    /* @arrow :: _ ~> Number */
    return NUM_ITEMS - 1;
}

function initSort() {
    /* @arrow :: _ ~> (Bool, Number, Number) */
    return [false, NUM_ITEMS, 0];
}

function shuffle(i) {
    /* @arrow :: Number ~> <loop: Number, halt: _> */
    var j = Math.floor(Math.random() * (i + 1));

    $('#sort-div').children().eq(NUM_ITEMS - i - 1).addClass('swapping');
    $('#sort-div').children().eq(NUM_ITEMS - j - 1).addClass('swapping');

    return i > 1 ? Arrow.loop(i - 1) : Arrow.halt();
}

function sort(s, i, p) {
    /* @arrow :: (Bool, Number, Number) ~> <loop: (Bool, Number, Number), halt: _> */
    var n1 = $('#sort-div').children().eq(NUM_ITEMS - i);
    var n2 = $('#sort-div').children().eq(NUM_ITEMS - i + 1);
    var sw = false;

    if (parseInt(n1.css('width')) > parseInt(n2.css('width'))) {
        sw = true;
        n1.addClass('swapping');
        n2.addClass('swapping');
    } else {
        n1.addClass('looking')
        n2.addClass('looking')
    }

    if (i - 1 > p + 1) {
        return Arrow.loop([s || sw, i - 1, p]);
    } else {
        return s || sw ? Arrow.loop([false, NUM_ITEMS, p + 1]) : Arrow.halt();
    }
}

//
// Composition
//

function animate(init, main) {
    return init.seq(
        Arrow.id()
          .tap(clear)
          .seq(main).wait(ANIMATION)
          .tap(indent).wait(ANIMATION)
          .tap(swap).wait(ANIMATION)
          .tap(dedent).wait(ANIMATION)
          .repeat()
          .seq(clear.lift())
    );
}

function startWhenPressed(elem, arrow) {
    return new ElemArrow(elem).seq(
        setEnabled(false)
        .seq(arrow)
        .seq(setEnabled(true))
        .on('click')
    ).forever();
}

var doSort = animate(initSort.lift(), sort.lift());
var doShuffle = animate(initShuffle.lift(), shuffle.lift());

// Main

startWhenPressed('#sort', doSort).run();
startWhenPressed('#shuffle', doShuffle).run();
