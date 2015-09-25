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
          i3 = return ^b0, i2
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

  it('should spill on high contention', function() {
    var a = fixtures.createAllocator(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 1
          i1 = literal 2
          i2 = literal 3
          i3 = literal 4
          i4 = literal 5
          i5 = add i0, i0
          i6 = add i1, i1
          i7 = add i2, i2
          i8 = add i3, i3
          i9 = add i4, i4
          i10 = return ^b0, i9
        }
      }
    */});

    a.allocate();

    check(a, function() {/*
      %0 = literal
      %1 = literal
      %2 = literal
      %3 = literal
      [0] = literal
      %0 = add %0 %0
      %0 = add %1 %1
      %0 = add %2 %2
      %0 = add %3 %3
      %0 = add [0] [0]
      (none) = return %0
    */});
  });

  it('should spill on call', function() {
    var a = fixtures.createAllocator(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 1
          i1 = literal 2
          i2 = literal 3
          i3 = literal 4
          i4 = literal 5
          i5 = call i0, i0
          i6 = add i1, i1
          i7 = add i2, i2
          i8 = add i3, i3
          i9 = add i4, i4
          i10 = return ^b0, i9
        }
      }
    */});

    a.allocate();

    check(a, function() {/*
      %0 = literal
      %1 = literal
      %2 = literal
      %3 = literal
      [0] = literal
      %0 = call %0 %0
      %0 = add [3] [3]
      %0 = add [2] [2]
      %0 = add [1] [1]
      %0 = add [0] [0]
      (none) = return %0
    */});
  });

  it('should account register hints', function() {
    var a = fixtures.createAllocator(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 1
          i1 = literal 2
          i2 = literal 3
          i3 = literal 4
          i4 = literal 5
          i5 = literal 6
          i6 = literal 7
          i7 = add i0, i1
          i8 = add i2, i3
          i9 = add i4, i5
          i10 = return ^b0, i6
        }
      }
    */});

    a.allocate();

    check(a, function() {/*
      %0 = literal
      %1 = literal
      %2 = literal
      %3 = literal
      [0] = literal
      [1] = literal
      [2] = literal
      %0 = add %0 %1
      %0 = add %2 %3
      %0 = add [0] [1]
      (none) = return %0
    */});
  });
});
