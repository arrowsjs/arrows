function animateSwap(onComplete) {
    setTimeout(() => {
        indent();
        setTimeout(() => {
            swap();
            setTimeout(() => {
                dedent();
                setTimeout(onComplete, ANIMATION);
            }, ANIMATION);
        }, ANIMATION);
    }, ANIMATION);
}

function animateShuffle(i) {
    clear();

    if (i > 0) {
        var j = Math.floor(Math.random() * (i + 1));
        $('#sort-div').children().eq(NUM_ITEMS - i - 1).addClass('swapping');
        $('#sort-div').children().eq(NUM_ITEMS - j - 1).addClass('swapping');

        animateSwap(() => animateShuffle(i - 1));
    } else {
        $('#sort').prop('disabled', false);
        $('#shuffle').prop('disabled', false);
    }
}

function animateSort(i, hasInversion, numSorted) {
    clear();

    var n1 = $('#sort-div').children().eq(NUM_ITEMS - i);
    var n2 = $('#sort-div').children().eq(NUM_ITEMS - i + 1);
    var inverted = false;

    if (parseInt(n1.css('width')) > parseInt(n2.css('width'))) {
        inverted = true;
        n1.addClass('swapping');
        n2.addClass('swapping');
    } else {
        n1.addClass('looking')
        n2.addClass('looking')
    }

    if (i - 1 > numSorted + 1 || hasInversion || inverted) {
        animateSwap(() => {
            if (i - 1 > numSorted + 1) {
                animateSort(i - 1, hasInversion || inverted, numSorted);
            } else {
                animateSort(NUM_ITEMS, false, numSorted + 1);
            }
        })
    } else {
        clear();
        $('#sort').prop('disabled', false);
        $('#shuffle').prop('disabled', false);
    }
}

$('#shuffle').click(() => {
    $('#sort').prop('disabled', true);
    $('#shuffle').prop('disabled', true);

    animateShuffle(NUM_ITEMS - 1);
});

$('#sort').click(() => {
    $('#sort').prop('disabled', true);
    $('#shuffle').prop('disabled', true);

    animateSort(NUM_ITEMS, false, 0);
});
