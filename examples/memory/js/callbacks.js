function selectOne(cards, onComplete) {
    // NOTE: $.one does not work as we're dealing with a set of elements,
    // so one event _per element_ can occur when using this method. We
    // have to implement this by hand with explicit cancellation.

    const handler = ev => {
        cancel();

        if (select(cards, ev)) {
            selectOne(cards, onComplete);
        } else {
            onComplete();
        }
    }

    const cancel = () => {
        cards.off('click', handler);
    }

    cards.on('click', handler);
}

function game(cards, onComplete) {
    clear(cards);

    selectOne(cards, () => {
        selectOne(cards, () => {
            setTimeout(() => {
                freeze(cards, validate(cards));

                setTimeout(() => {
                    if (cardsLeft(cards)) {
                        game(cards, onComplete);
                    } else {
                        onComplete();
                    }
                }, 500);
            }, 500);
        });
    });
}

$('#play').click(() => {
    let cards = setup();

    $('#play').prop('disabled', true);

    setTimeout(() => {
        game(cards, () => {
            won();
            $('#play').prop('disabled', false);
        });
    }, 1000);
});
