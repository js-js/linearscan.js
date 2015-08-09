'use strict';

var assert = require('assert');

var linearscan = require('../');
var Interval = linearscan.Interval;
var Operand = linearscan.Operand;

describe('Interval', function() {
  var interval;
  beforeEach(function() {
    interval = new Interval(null);
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

    it('should not add empty range', function() {
      interval.addRange(10, 10);

      assert.equal(interval.ranges.length, 0);
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

      it('should not shorten the range', function() {
        interval.fillRange(0, 10);
        interval.fillRange(0, 6);

        assert.equal(interval.start(), 0);
        assert.equal(interval.end(), 10);
      });

      it('should not fill empty range', function() {
        interval.fillRange(10, 10);

        assert.equal(interval.ranges.length, 0);
      });
    });
  });

  describe('uses', function() {
    it('should add use', function() {
      interval.use(3, new Operand('any'));
      interval.use(1, new Operand('any'));
      var use = interval.use(2, new Operand('any'));
      assert.equal(use.pos, 2);

      assert.equal(interval.uses[0].pos, 1);
      assert.equal(interval.uses[1].pos, 2);
      assert.equal(interval.uses[2].pos, 3);
    });

    it('should support firstUseAfter', function() {
      interval.use(3, new Operand('any'));
      interval.use(1, new Operand('any'));
      interval.use(2, new Operand('any'));

      var use = interval.firstUseAfter(1);
      assert.equal(use.pos, 1);

      var use = interval.firstUseAfter(3);
      assert.equal(use.pos, 3);

      var use = interval.firstUseAfter(-1);
      assert.equal(use.pos, 1);

      var use = interval.firstUseAfter(4);
      assert(use === null);
    });

    it('should support filtered firstUseAfter', function() {
      interval.use(1, new Operand('any'));
      interval.use(2, new Operand('register'));
      interval.use(3, new Operand('any'));

      var use = interval.firstUseAfter(1, 'register');
      assert.equal(use.pos, 2);

      var use = interval.firstUseAfter(3, 'register');
      assert(use === null);

      var use = interval.firstUseAfter(-1, 'register');
      assert.equal(use.pos, 2);

      var use = interval.firstUseAfter(4, 'register');
      assert(use === null);
    });
  });

  describe('splitting', function() {
    it('should create proper tree', function() {
      interval.addRange(0, 40);

      var a = interval.split(10);
      var b = a.split(20);
      var c = b.split(30);

      assert(a.parent === interval);
      assert(b.parent === interval);
      assert(c.parent === interval);

      assert.equal(interval.start(), 0);
      assert.equal(interval.end(), 10);
      assert.equal(a.start(), 10);
      assert.equal(a.end(), 20);
      assert.equal(b.start(), 20);
      assert.equal(b.end(), 30);
      assert.equal(c.start(), 30);
      assert.equal(c.end(), 40);
    });

    it('should remove interval from tree', function() {
      interval.addRange(0, 30);

      var a = interval.split(10);
      var b = a.split(20);

      a.remove();

      assert.equal(interval.children.length, 1);
      assert(interval.covers(0));
      assert(!interval.covers(10));
      assert(!b.covers(10));
      assert(b.covers(20));
      assert(!b.covers(30));
    });

    describe('ranges', function() {
      it('should split not covered ranges', function() {
        interval.addRange(0, 1);
        interval.addRange(2, 3);

        var child = interval.split(1);
        assert.equal(interval.start(), 0);
        assert.equal(interval.end(), 1);

        assert.equal(child.start(), 2);
        assert.equal(child.end(), 3);
      });

      it('should split covered ranges', function() {
        interval.addRange(0, 1);
        interval.addRange(2, 10);
        interval.addRange(12, 13);

        var child = interval.split(5);
        assert.equal(interval.start(), 0);
        assert.equal(interval.end(), 5);

        assert(interval.covers(0));
        assert(!interval.covers(1));
        assert(interval.covers(2));
        assert(!interval.covers(5));

        assert.equal(child.start(), 5);
        assert.equal(child.end(), 13);

        assert(child.covers(5));
        assert(child.covers(9));
        assert(!child.covers(10));
        assert(child.covers(12));
        assert(!child.covers(13));
      });
    });

    describe('uses', function() {
      it('should split uses without match', function() {
        interval.use(1, new Operand('any'));
        interval.use(3, new Operand('any'));
        interval.use(5, new Operand('any'));

        var child = interval.split(2);

        assert.equal(interval.uses.length, 1);
        assert.equal(interval.uses[0].pos, 1);

        assert.equal(child.uses.length, 2);
        assert.equal(child.uses[0].pos, 3);
        assert.equal(child.uses[1].pos, 5);
      });

      it('should split uses with match', function() {
        interval.use(1, new Operand('any'));
        interval.use(2, new Operand('any'));
        interval.use(3, new Operand('any'));

        var child = interval.split(2);

        assert.equal(interval.uses.length, 1);
        assert.equal(interval.uses[0].pos, 1);

        assert.equal(child.uses.length, 2);
        assert.equal(child.uses[0].pos, 2);
        assert.equal(child.uses[1].pos, 3);
      });
    });
  });

  describe('intersect', function() {
    it('should return false', function() {
      interval.addRange(0, 10);
      interval.addRange(20, 30);
      interval.addRange(40, 50);

      var other = new Interval(null);
      other.addRange(10, 20);
      other.addRange(30, 40);
      other.addRange(50, 60);

      assert(interval.intersect(other) === false);
      assert(other.intersect(interval) === false);
    });

    it('should return position in case of our closest', function() {
      interval.addRange(0, 10);
      interval.addRange(20, 30);
      interval.addRange(40, 50);

      var other = new Interval(null);
      other.addRange(10, 20);
      other.addRange(30, 40);
      other.addRange(45, 60);

      assert.equal(interval.intersect(other), 45);
      assert.equal(other.intersect(interval), 45);
    });

    it('should return position in case of their closest', function() {
      interval.addRange(0, 10);
      interval.addRange(20, 30);
      interval.addRange(40, 50);

      var other = new Interval(null);
      other.addRange(10, 20);
      other.addRange(30, 45);
      other.addRange(50, 60);

      assert.equal(interval.intersect(other), 40);
      assert.equal(other.intersect(interval), 40);
    });

    it('should return position in case of start coverage', function() {
      interval.addRange(20, 30);

      var other = new Interval(null);
      other.addRange(10, 40);

      assert.equal(interval.intersect(other), 20);
      assert.equal(other.intersect(interval), 20);
    });
  });

  describe('childAt', function() {
    it('should return child that covers interval', function() {
      interval.addRange(0, 60);

      var a = interval.split(20);
      var b = a.split(40);

      assert(interval.childAt(-10) === null);
      assert(interval.childAt(10) === interval);
      assert(interval.childAt(30) === a);
      assert(interval.childAt(45) === b);
      assert(interval.childAt(60) === null);
    });
  });

  describe('nextChild', function() {
    it('should return first child if called on root', function() {
      interval.addRange(0, 60);

      var a = interval.split(20);

      assert(interval.nextChild() === a);
    });

    it('should return next child if called on child', function() {
      interval.addRange(0, 60);

      var a = interval.split(20);
      var b = a.split(40);

      assert(a.nextChild() === b);
      assert(b.nextChild() === null);
    });
  });

  describe('prevChild', function() {
    it('should return root when called on first child', function() {
      interval.addRange(0, 60);

      var a = interval.split(20);

      assert(a.prevChild() === interval);
    });

    it('should return prev child if called on child', function() {
      interval.addRange(0, 60);

      var a = interval.split(20);
      var b = a.split(40);

      assert(interval.prevChild() === null);
      assert(a.prevChild() === interval);
      assert(b.prevChild() === a);
    });
  });
});
