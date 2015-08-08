'use strict';

var fixtures = require('./fixtures');
var check = fixtures.checkAllocator;

describe('Interval Allocator', function() {
  it('should allocate without spills', function() {
    var a = fixtures.createAllocator(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 1
          i1 = literal 2
          i2 = add i0, i1
          i3 = return i2
        }
      }
    */});

    a.allocate();

    check(a, function() {/*
      %0 = literal
      %1 = literal
      %0 = add %0 %1
      (none) = return %0
    */});
  });
});
