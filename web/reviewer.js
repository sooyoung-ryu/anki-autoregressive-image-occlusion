(function () {
    var _revealed = 0;
    var _hiddenTotal = -1; // -1 = not yet computed for this card
    var _lastConfig = null;
    // The template calls anki.imageOcclusion.setup(), not anki.setupImageCloze()
    var _originalSetup = anki.imageOcclusion.setup;

    function rerender() {
        anki.imageOcclusion.setup(_lastConfig);
    }

    // Sort key for a shape: by ordinal first, then top-to-bottom, then left-to-right.
    // Used to give a stable reveal order across renders.
    function shapeKey(s) {
        return s.ordinal + "," + Math.round(s.top * 1e4) + "," + Math.round(s.left * 1e4);
    }

    function shapeOrder(a, b) {
        if (a.ordinal !== b.ordinal) return a.ordinal - b.ordinal;
        if (a.top !== b.top) return a.top - b.top;
        return a.left - b.left;
    }

    // Returns modified draw data with the first _revealed shapes moved to highlightShapes
    // (renders as an outline trace). Shapes are sorted by (ordinal, top, left).
    // Returns null when _revealed === 0 (no-op, avoids unnecessary work on initial render).
    function filterShapes(data) {
        if (_revealed === 0) return null;

        var allHidden = data.activeShapes
            .concat(data.inactiveShapes.filter(function (s) { return s.occludeInactive; }))
            .sort(shapeOrder);

        if (allHidden.length === 0) return null;

        var revealedKeys = {};
        for (var i = 0; i < Math.min(_revealed, allHidden.length); i++) {
            revealedKeys[shapeKey(allHidden[i])] = true;
        }

        var newHighlight = (data.highlightShapes || []).concat(
            data.activeShapes.filter(function (s) { return revealedKeys[shapeKey(s)]; })
        );

        return {
            activeShapes: data.activeShapes.filter(function (s) {
                return !revealedKeys[shapeKey(s)];
            }),
            inactiveShapes: data.inactiveShapes.filter(function (s) {
                return !revealedKeys[shapeKey(s)];
            }),
            highlightShapes: newHighlight,
            properties: data.properties
        };
    }

    // Wrap anki.imageOcclusion.setup (what the card template actually calls)
    anki.imageOcclusion.setup = function (config) {
        _lastConfig = config || {};
        var userHook = _lastConfig.onWillDrawShapes;

        var wrapped = Object.assign({}, _lastConfig, {
            onWillDrawShapes: function (data, ctx) {
                var base = userHook ? (userHook(data, ctx) || data) : data;
                return filterShapes(base);
            }
        });

        return _originalSetup.call(this, wrapped);
    };
    anki.setupImageCloze = anki.imageOcclusion.setup;

    // Called by Python each time a new IO question is shown.
    // Only resets state — does NOT read the DOM here because the new card's
    // HTML hasn't been injected yet (Anki queues it on a Promise chain).
    window.ioInit = function () {
        _revealed = 0;
        _hiddenTotal = -1;
    };

    // Called by Python on each spacebar press.
    window.ioRevealNext = function () {
        // Lazily count hidden shapes on the first press for this card.
        // By the time the user can press a key, the card DOM is fully ready.
        if (_hiddenTotal === -1) {
            var els = Array.from(document.querySelectorAll(".cloze")).concat(
                Array.from(document.querySelectorAll(".cloze-inactive"))
                    .filter(function (el) { return el.dataset.occludeinactive === "1"; })
            );
            _hiddenTotal = els.length;
        }

        // Single-shape card: skip reveal step, go straight to answer
        if (_hiddenTotal <= 1) {
            pycmd("ioShowAnswer");
            return;
        }

        _revealed++;
        rerender();

        if (_revealed >= _hiddenTotal) {
            // Wait for the canvas re-render before showing the answer
            requestAnimationFrame(function () {
                pycmd("ioShowAnswer");
            });
        }
    };
}());
