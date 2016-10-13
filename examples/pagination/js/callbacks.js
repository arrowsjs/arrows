function displayPage(results, rangeLeft, rangeRight, count) {
    $('#results tbody').empty();

    $('#meta').text('Displaying ' + rangeLeft + '-' + rangeRight + ' of ' + count);

    for (let row of results) {
        let tr = $('<tr />');
        for (let field of ['id', 'name', 'category', 'sub_category', 'price_per_unit', 'margin']) {
            tr.append($('<td />').text(row[field]));
        }

        $('#results tbody').append(tr);
    }
}

var cache = {};

function ajaxOrCached(query, page, handler) {
    if ([query, page] in cache) {
        return handler(cache[[query, page]]);
    }

    $.ajax({
        'url'     : 'http://localhost:8080?q=' + query + '&page=' + page,
        'dataType': 'json',
        'success' : result => {
            cache[[query, page]] = result;
            handler(result);
        }
    });
}

function showPage(query, page) {
    function handler(results) {
        $('.paging-control').addClass('enabled');
        let prev = results.prev;
        let next = results.next;

        displayPage(results.results, results.rangeLeft, results.rangeRight, results.count);

        // NOTE: This is not equivalent to the arrows version. This
        // pre-fetching will not be canceled when the user interacts
        // with paging controls.

        ajaxOrCached(query, page, () => {});

        const h1 = () => { $('#next').off('click', h2); showPage(query, prev); };
        const h2 = () => { $('#prev').off('click', h1); showPage(query, next); };

        $('#prev').one('click', h1);
        $('#next').one('click', h2);
    }

    $('.paging-control').addClass('disabled');
    ajaxOrCached(query, page, handler);
}

var clicks = 0;

$('#filter').keyup((ev) => {
    var expected = ++clicks;
    setTimeout(() => {
        if (expected != clicks) {
            return;
        }

        $('#prev').unbind('click');
        $('#next').unbind('click');

        showPage($(ev.target).val(), 1);
    }, 400);
});
