const NUM_ITEMS = 10;
const ANIMATION = 75;
const ANIMATION_PARTIAL = 3 * ANIMATION / 4;

$(document).ready(function() {
    for (var i = 0; i < NUM_ITEMS; i++) {
        $('#sort-div').append($('<div />').css({
            'top': i * 10 + 'px',
            'width': (i + 1) * 25 + 'px'
        }));
    }
});

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
