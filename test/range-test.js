'use strict';

var assert = require('assert');

var linearscan = require('../');
/* jshint -W079 */
var Range = linearscan.Range;

describe('Range', function() {
  describe('covers', function() {
    it('should return false to the left', function() {
      assert(!new Range(1, 2).covers(0));
    });

    it('should return true at the start', function() {
      assert(new Range(1, 2).covers(1));
    });

    it('should return false at the end', function() {
      assert(!new Range(1, 2).covers(2));
    });
  });

  describe('intersect', function() {
    it('should return false when a < b', function() {
      var a = new Range(1, 3);
      var b = new Range(3, 4);

      assert(a.intersect(b) === false);
    });

    it('should return false when a > b', function() {
      var a = new Range(3, 4);
      var b = new Range(1, 3);

      assert(a.intersect(b) === false);
    });

    it('should return pos when a.start<b.start && a.end>b.start', function() {
      var a = new Range(1, 4);
      var b = new Range(3, 6);

      assert.equal(a.intersect(b), 3);
    });

    it('should return pos when a.start>b.start && a.end<b.start', function() {
      var a = new Range(3, 6);
      var b = new Range(1, 4);

      assert.equal(a.intersect(b), 3);
    });

    it('should return pos when a.start<b.start && a.end>b.start', function() {
      var a = new Range(1, 6);
      var b = new Range(3, 4);

      assert.equal(a.intersect(b), 3);
    });

    it('should return pos when a.start>b.start && a.end<b.start', function() {
      var a = new Range(3, 4);
      var b = new Range(1, 6);

      assert.equal(a.intersect(b), 3);
    });
  });
});
