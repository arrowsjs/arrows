var playing = 0;

function reset() {
    showAll();
    $('#play').prop('disabled', false);
}

function popup(expected, selector) {
    if (playing != expected) {
        return;
    }

    if (hits >= 10) {
        won();
        reset();
        playing = false;
    }

    setTimeout(function() {
        if (playing != expected) {
            return;
        }

        const cancel = () => {
            clearTimeout(timeout);
            $(selector).off('click', handler1);
        }

        const handler1 = () => {
            if (playing != expected) {
                return;
            }

            hit();
            handler2();
        }

        const handler2 = () => {
            if (playing != expected) {
                return;
            }

            cancel();
            $(selector).flip(false);
            popup(expected, selector);
        }

        $(selector).flip(true);

        $(selector).one('click', handler1);
        var timeout = setTimeout(handler2, randomTimeout());
    }, randomTimeout());
}

$('#play').click(() => {
    $('#play').prop('disabled', true);

    setup();
    hideAll();
    var expected = ++playing;

    for (var i = 1; i <= 9; i++) {
        popup(expected, '#hole' + i);
    }

    setTimeout(function() {
        if (playing != expected) {
            return;
        }

        lost();
        reset();
        playing++;
    }, 15000);
});
