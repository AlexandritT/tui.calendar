/**
 * @fileoverview View for rendered events by times.
 * @author NHN Ent. FE Development Team <dl_javascript@nhnent.com>
 */
'use strict';

var util = global.tui.util;
var config = require('../../config');
var common = require('../../common/common');
var domutil = require('../../common/domutil');
var datetime = require('../../common/datetime');
var reqAnimFrame = require('../../common/reqAnimFrame');
var View = require('../view');
var Time = require('./time');
var AutoScroll = require('../../common/autoScroll');
var mainTmpl = require('../template/week/timeGrid.hbs');

var PIXEL_RENDER_ERROR = 0.5;
var HOURMARKER_REFRESH_INTERVAL = 1000 * 10;
var INITIAL_AUTOSCROLL_DELAY = util.browser.msie ? 100 : 50;

/**
 * @constructor
 * @extends {View}
 * @param {object} options The object for view customization.
 * @param {number} [options.hourStart=0] You can change view's start hours.
 * @param {number} [options.hourEnd=0] You can change view's end hours.
 * @param {HTMLElement} container Container element.
 */
function TimeGrid(options, container) {
    container = domutil.appendHTMLElement(
        'div',
        container,
        config.classname('timegrid-container')
    );

    View.call(this, container);

    if (!util.browser.safari) {
        /**
         * @type {AutoScroll}
         */
        this._autoScroll = new AutoScroll(container);
    }

    /**
     * Time view options.
     * @type {object}
     */
    this.options = util.extend({
        hourStart: 9,
        hourEnd: 19 
    }, options);

    /**
     * Interval id for hourmarker animation.
     * @type {number}
     */
    this.intervalID = 0;

    /**
     * @type {boolean}
     */
    this._scrolled = false;

    this.attachEvent();
}

util.inherit(TimeGrid, View);

/**********
 * Prototype props
 **********/

/**
 * @type {string}
 */
TimeGrid.prototype.viewName = 'timegrid';

/**
 * Destroy view.
 * @override
 */
TimeGrid.prototype._beforeDestroy = function() {
    window.clearInterval(this.intervalID);

    if (this._autoScroll) {
        this._autoScroll.destroy();
    }

    this._autoScroll = this.hourmarker = null;
};

/**
 * Get base viewModel.
 * @returns {object} ViewModel
 */
TimeGrid.prototype._getBaseViewModel = function() {
    var options = this.options,
        end = options.hourEnd,
        i = options.hourStart,
        current = (new Date()).getHours(),
        hours = [];

    for (; i < end; i += 1) {
        hours.push({
            hour: i, 
            isCurrent: i === current
        });
    }

    return {hours: hours};
};

/**
 * Reconcilation child views and render.
 * @param {object} viewModels Viewmodel
 * @param {number} width The width percent of each time view.
 * @param {HTMLElement} container Container element for each time view.
 */
TimeGrid.prototype._renderChilds = function(viewModels, width, container) {
    var options = this.options,
        childOption,
        child,
        isToday,
        today = datetime.format(new Date(), 'YYYYMMDD'),
        i = 0;

    // clear contents
    container.innerHTML = '';
    this.childs.clear();
    this.todaymarkerLeft = null;

    // reconcilation of child views
    util.forEach(viewModels, function(events, ymd) {
        isToday = ymd === today;

        if (isToday) {
            this.todaymarkerLeft = width * this.childs.length;
        }

        childOption = {
            index: i,
            width: width,
            ymd: ymd,
            isToday: isToday,
            hourStart: options.hourStart,
            hourEnd: options.hourEnd
        };

        child = new Time(
            childOption,
            domutil.appendHTMLElement('div', container, config.classname('time-date'))
        );
        child.render(ymd, events);

        this.addChild(child);

        i += 1;
    }, this);
};

/**
 * @override
 * @param {object} viewModel ViewModel list from Week view.
 */
TimeGrid.prototype.render = function(viewModel) {
    var timeViewModel = viewModel.eventsInDateRange.time,
        container = this.container,
        baseViewModel = this._getBaseViewModel(),
        eventLen = util.keys(timeViewModel).length;

    if (!eventLen) {
        return;
    }

    container.innerHTML = mainTmpl(baseViewModel);

    /**********
     * Render childs
     **********/
    this._renderChilds(
        timeViewModel,
        100 / eventLen,
        domutil.find('.' + config.classname('timegrid-events-container'), container)
    );

    this._hourLabels = domutil.find('ul', container);

    /**********
     * Render hourmarker
     **********/
    this.hourmarker = domutil.find('.' + config.classname('timegrid-hourmarker'), container);
    this.refreshHourmarker();

    if (!this._scrolled) {
        this._scrolled = true;
        this.scrollToNow();
    }
};

/**
 * Refresh hourmarker element.
 */
TimeGrid.prototype.refreshHourmarker = function() {
    var hourLabels = this._hourLabels,
        hourmarker = this.hourmarker,

        viewModel = this._getHourmarkerViewModel(),
        todaymarkerLeft = this.todaymarkerLeft,
        todaymarker,
        text,
        labelToVisible,
        labelToInvisible;

    if (!hourmarker || !viewModel) {
        return;
    }

    todaymarker = domutil.find('.' + config.classname('timegrid-todaymarker'), hourmarker);
    text = domutil.find('.' + config.classname('timegrid-hourmarker-time'), hourmarker);
    labelToVisible = domutil.find('.' + config.classname('invisible'), hourLabels);
    labelToInvisible = domutil.find('.' + config.classname('timegrid-hour-') + viewModel.hour, hourLabels);

    reqAnimFrame.requestAnimFrame(function() {
        if (labelToVisible !== labelToInvisible) {
            if (labelToVisible) {
                domutil.removeClass(labelToVisible, config.classname('invisible'));
            }

            if (labelToInvisible) {
                domutil.addClass(labelToInvisible, config.classname('invisible'));
            }
        }

        hourmarker.style.display = 'block';
        hourmarker.style.top = (viewModel.top - PIXEL_RENDER_ERROR) + '%';

        if (!util.isNull(todaymarkerLeft)) {
            todaymarker.style.display = 'block';
            todaymarker.style.left = todaymarkerLeft + '%';
        } else {
            todaymarker.style.display = 'none';
        }

        text.innerHTML = viewModel.text;
    });
};

/**
 * Return grid size.
 * @returns {number[]} The size of grid element.
 */
TimeGrid.prototype._getGridSize = function() {
    var childNode = this.container.childNodes[0];

    if (!childNode) {
        return false;
    }

    return domutil.getSize(childNode);
};

/**
 * @param {Date} [time] - date object to convert pixel in grids.
 * use **Date.now()** when not supplied.
 * @returns {number} The pixel value represent current time in grids.
 */
TimeGrid.prototype._getTopPercentByTime = function(time) {
    var now = util.isDate(time) ? new Date(+time) : new Date(),
        raw = datetime.raw(now),
        opt = this.options,
        hourLength = util.range(opt.hourStart, opt.hourEnd).length,
        hmsMilliseconds = datetime.millisecondsFrom('hour', raw.h) +
            datetime.millisecondsFrom('minutes', raw.m) +
            datetime.millisecondsFrom('seconds', raw.s);

    return common.ratio(hourLength * datetime.MILLISECONDS_PER_HOUR, 100, hmsMilliseconds);
};

/**
 * Get Hourmarker viewmodel.
 * @returns {object} ViewModel of hourmarker.
 */
TimeGrid.prototype._getHourmarkerViewModel = function() {
    var now = new Date();

    return {
        top: this._getTopPercentByTime(),
        hour: now.getHours(),
        text: datetime.format(now, 'HH:mm')
    };
};

/**
 * Attach events
 */
TimeGrid.prototype.attachEvent = function() {
    window.clearInterval(this.intervalID);
    this.intervalID = window.setInterval(util.bind(this.onTick, this), HOURMARKER_REFRESH_INTERVAL);
};

/**
 * Scroll time grid to current hourmarker.
 */
TimeGrid.prototype.scrollToNow = function() {
    var container = this.container;

    window.setTimeout(util.bind(function() {
        var currentHourTop = this._getTopPercentByTime(),
            viewBound = this.getViewBound();

        container.scrollTop = (currentHourTop - (viewBound.height / 2));
    }, this), INITIAL_AUTOSCROLL_DELAY);
};

/**********
 * CalEvent handlers
 **********/

/**
 * Interval tick handler
 */
TimeGrid.prototype.onTick = function() {
    this.refreshHourmarker();
};

module.exports = TimeGrid;

