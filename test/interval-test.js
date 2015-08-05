'use strict';

var assert = require('assert');

var linearscan = require('../');

describe('Interval', function() {
  var interval;
  beforeEach(function() {
    interval = new linearscan.Interval(null);
  });

  describe('ranges', function() {
    it('should add new range', function() {
      interval.addRange(0, 1);
      assert.equal(interval.ranges.length, 1);

      interval.addRange(2, 3);

      assert.equal(interval.ranges.length, 2);
      assert.equal(interval.ranges[0].end, 1);
      assert.equal(interval.ranges[1].start, 2);
    });

    it('should coalesce to previous range', function() {
      interval.addRange(0, 1);
      assert.equal(interval.ranges.length, 1);

      interval.addRange(1, 2);

      assert.equal(interval.ranges.length, 1);
      assert.equal(interval.ranges[0].start, 0);
      assert.equal(interval.ranges[0].end, 2);
    });

    it('should coalesce to next range', function() {
      interval.addRange(0, 1);
      interval.addRange(3, 4);
      assert.equal(interval.ranges.length, 2);

      interval.addRange(2, 3);

      assert.equal(interval.ranges.length, 2);
      assert.equal(interval.ranges[1].start, 2);
      assert.equal(interval.ranges[1].end, 4);
    });

    it('should support covers', function() {
      interval.addRange(0, 1);
      interval.addRange(3, 4);
      interval.addRange(2, 3);

      assert(interval.covers(0));
      assert(!interval.covers(1));
      assert(interval.covers(2));
      assert(interval.covers(3));
      assert(!interval.covers(4));
    });

    it('should update start', function() {
      interval.addRange(1, 2);
      interval.updateStart(0);

      assert(interval.covers(0));
      assert(interval.covers(1));
      assert(!interval.covers(2));
    });

    it('should support start()/end()', function() {
      interval.addRange(0, 1);
      interval.addRange(2, 3);

      assert.equal(interval.start(), 0);
      assert.equal(interval.end(), 3);
    });

    describe('fillRange', function() {
      it('should fill empty interval', function() {
        interval.fillRange(0, 10);

        assert.equal(interval.start(), 0);
        assert.equal(interval.end(), 10);
      });

      it('should add chunk at interval start', function() {
        interval.addRange(11, 12);
        interval.fillRange(0, 10);

        assert.equal(interval.ranges.length, 2);
        assert.equal(interval.start(), 0);
        assert.equal(interval.end(), 12);
      });

      it('should add chunk at interval end', function() {
        interval.addRange(0, 10);
        interval.fillRange(11, 12);

        assert.equal(interval.ranges.length, 2);
        assert.equal(interval.start(), 0);
        assert.equal(interval.end(), 12);
      });

      it('should grow interval to the right', function() {
        interval.addRange(0, 10);
        interval.fillRange(8, 12);

        assert.equal(interval.ranges.length, 1);
        assert.equal(interval.start(), 0);
        assert.equal(interval.end(), 12);
      });

      it('should grow interval to the left', function() {
        interval.addRange(8, 12);
        interval.fillRange(0, 10);

        assert.equal(interval.ranges.length, 1);
        assert.equal(interval.start(), 0);
        assert.equal(interval.end(), 12);
      });

      it('should grow interval to both sides', function() {
        interval.addRange(8, 10);
        interval.fillRange(0, 12);

        assert.equal(interval.ranges.length, 1);
        assert.equal(interval.start(), 0);
        assert.equal(interval.end(), 12);
      });

      it('should consume/union middle intervals', function() {
        interval.addRange(8, 12);
        interval.addRange(6, 7);
        interval.addRange(3, 4);
        interval.addRange(0, 2);
        interval.fillRange(2, 9);

        assert.equal(interval.ranges.length, 1);
        assert.equal(interval.start(), 0);
        assert.equal(interval.end(), 12);
      });

      it('should union with adjacent interval', function() {
        interval.addRange(8, 12);
        interval.fillRange(0, 8);

        assert.equal(interval.ranges.length, 1);
        assert.equal(interval.start(), 0);
        assert.equal(interval.end(), 12);
      });
    });
  });

  describe('uses', function() {
    it('should add use', function() {
      interval.use(3, null);
      interval.use(1, null);
      var use = interval.use(2, null);
      assert.equal(use.pos, 2);

      assert.equal(interval.uses[0].pos, 1);
      assert.equal(interval.uses[1].pos, 2);
      assert.equal(interval.uses[2].pos, 3);
    });

    it('should support firstUseAfter', function() {
      interval.use(3, null);
      interval.use(1, null);
      interval.use(2, null);

      var use = interval.firstUseAfter(1);
      assert.equal(use.pos, 2);

      var use = interval.firstUseAfter(3);
      assert(use === null);

      var use = interval.firstUseAfter(-1);
      assert.equal(use.pos, 1);
    });
  });
});
