'use strict';

var fixtures = require('./fixtures');
var check = fixtures.checkResolver;

describe('Interval Resolver', function() {
  it('should resolve without moves', function() {
    var r = fixtures.createResolver(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 1
          i1 = literal 2
          i2 = add i0, i1
          i3 = return i2
        }
      }
    */});

    r.resolve();

    check(r, function() {/*
      1: %0 = literal
      3: %1 = literal
      5: %0 = add %0, %1
      7: return %0
    */});
  });

  it('should resolve with move at fixed', function() {
    var r = fixtures.createResolver(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = rbx-call
          i1 = return i0
        }
      }
    */});

    r.resolve();

    check(r, function() {/*
      1: %1 = rbx-call
      2. gap {%1=>%0}
      3: return %0
    */});
  });

  it('should resolve with move at fixed', function() {
    var r = fixtures.createResolver(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 1
          i1 = literal 2
          i2 = add i0, i1
          i3 = return i1
        }
      }
    */});

    r.resolve();

    check(r, function() {/*
      1: %0 = literal
      3: %1 = literal
      5: %0 = add %0, %1
      6. gap {%1=>%0}
      7: return %0
    */});
  });

  it('should resolve with spills', function() {
    var r = fixtures.createResolver(fixtures.options, function() {/*
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
        }
      }
    */});

    r.resolve();

    check(r, function() {/*
      1: %0 = literal
      3: %1 = literal
      5: %2 = literal
      7: %3 = literal
      8. gap {%3=>[0]}
      9: %3 = literal
      11: %0 = add %0, %0
      13: %0 = add %1, %1
      15: %0 = add %2, %2
      17: %0 = add [0], [0]
      19: %0 = add %3, %3
    */});
  });

  it('should resolve with spills', function() {
    var r = fixtures.createResolver(fixtures.options, function() {/*
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
        }
      }
    */});

    r.resolve();

    check(r, function() {/*
      1: %0 = literal
      3: %1 = literal
      5: %2 = literal
      7: %3 = literal
      8. gap {%3=>[0]}
      9: %3 = literal
      11: %0 = add %0, %0
      13: %0 = add %1, %1
      15: %0 = add %2, %2
      17: %0 = add [0], [0]
      19: %0 = add %3, %3
    */});
  });

  it('should resolve phis', function() {
    var r = fixtures.createResolver(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = if ^b0
        }
        b0 -> b1, b2

        b1 {
          i1 = rax-out
          i2 = jump ^b1
        }
        b1 -> b3

        b2 {
          i3 = rbx-out
          i4 = jump ^b2
        }
        b2 -> b3

        b3 {
          i5 = ssa:phi ^b3, i1, i3
          i6 = return i5
        }
      }
    */});

    r.resolve();

    check(r, function() {/*
      1: if &5, &11

      5: %1 = rax-out
      7: jump &19

      11: %1 = rbx-out
      13: jump &19

      19: return %0
    */});
  });
});
