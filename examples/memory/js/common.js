var cardB = 'back';
var cardF = 'front';

function createCard() {
    return $('<div />').addClass('card')
        .append($('<div />').addClass(cardF))
        .append($('<div />').addClass(cardB));
}

function shuffle(array) {
    for (var i = array.length - 1; i >= 0; i--) {
        var j = Math.floor(Math.random() * i);

        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }

    return array;
}

//
// Shared Functions, Lifted/Called
//

function setup() {
    /* @arrow :: _ ~> Elem */
    var grid = $('#grid').empty();
    var deck = Array.create(16, 0).map((v, i) => Math.floor(i / 2) + 1);

    shuffle(deck).forEach(v => {
        var card = createCard();

        grid.append(card);
        card.find('.' + cardF).html(v);
        card.find('.' + cardB).html('?');

        card.flip({
            trigger: 'manual'
        });
    });

    return grid.find('.card');
}

function clear(cards) {
    /* @arrow :: Elem ~> _ */
    cards.flip(true);
    cards.removeClass('flipped');
}

function select(cards, event) {
    /* @arrow :: (Elem, Event) ~> Bool */

    var element = $(event.target);
    if (!element.is('.card')) {
        element = element.parent();
    }

    if (element.is('.flipped') || element.is('.correct')) {
        return true;
    }

    element.flip(false);
    element.addClass('flipped');
    return false;
}

function validate(cards) {
    /* @arrow :: Elem ~> Bool */
    let [c1, c2] = cards.filter('.flipped').toArray();
    return $(c1).find('.front').html() === $(c2).find('.front').html();
}

function freeze(elems, matching) {
    /* @arrow :: (Elem, Bool) ~> _ */
    if (matching) {
        elems.filter('.flipped').fadeTo('slow', 0.0);
        elems.filter('.flipped').addClass('correct');
    }
}

function cardsLeft(cards) {
    /* @arrow :: Elem ~> Bool */
    return cards.filter(':not(.correct)').length > 0;
}

function won() {
    /* @arrow :: _ ~> _ */
    alert('You won!');
}
