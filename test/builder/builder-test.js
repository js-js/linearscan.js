'use strict';

var assert = require('assert');

var fixtures = require('../fixtures');

describe('Interval Builder', function() {
  it('should populate liveIn', function() {
    var b = fixtures.createBuilder(function() {/*
      pipeline {
        b0 {
          i0 = literal 1
          i1 = literal 2
          i2 = add i0, i1
        }
        b0 -> b1

        b1 {
          i3 = return i2
        }
      }
    */});

  });
});
