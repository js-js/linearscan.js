'use strict';

var assert = require('assert');

var linearscan = require('../../');
var builder = linearscan.builder;

describe('Interval Builder/Interval', function() {
  var interval;
  beforeEach(function() {
    interval = new builder.Interval(null);
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
