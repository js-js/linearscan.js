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
          i3 = return ^b0, i2
        }
      }
    */});

    r.resolve();

    check(r, function() {/*
      2: %0 = literal
      4: %1 = literal
      6: %0 = add %0, %1
      8: return %0
    */});
  });

  it('should resolve with move at fixed', function() {
    var r = fixtures.createResolver(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = rbx-call
          i1 = return ^b0, i0
        }
      }
    */});

    r.resolve();

    check(r, function() {/*
      2: %1 = rbx-call
      3: gap {%1=>%0}
      4: return %0
    */});
  });

  it('should resolve spills during call', function() {
    var r = fixtures.createResolver(fixtures.options, function() {/*
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

    r.resolve();

    check(r, function() {/*
      2: %0 = literal
      4: %1 = literal
      6: %2 = literal
      8: %3 = literal
      10: [0] = literal
      11: gap @{%1=>[3],%2=>[2],%3=>[1]}
      12: %0 = call %0, %0
      14: %0 = add [3], [3]
      16: %0 = add [2], [2]
      18: %0 = add [1], [1]
      20: %0 = add [0], [0]
      22: return %0
    */});
  });

  it('should resolve with move at fixed with return', function() {
    var r = fixtures.createResolver(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 1
          i1 = literal 2
          i2 = add i0, i1
          i3 = return ^b0, i1
        }
      }
    */});

    r.resolve();

    check(r, function() {/*
      2: %0 = literal
      4: %1 = literal
      6: %0 = add %0, %1
      7: gap {%1=>%0}
      8: return %0
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
          i10 = return ^b0, i9
        }
      }
    */});

    r.resolve();

    check(r, function() {/*
      2: %0 = literal
      4: %1 = literal
      6: %2 = literal
      8: %3 = literal
      10: [0] = literal
      12: %0 = add %0, %0
      14: %0 = add %1, %1
      16: %0 = add %2, %2
      18: %0 = add %3, %3
      20: %0 = add [0], [0]
      22: return %0
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
          i6 = return ^b3, i5
        }
      }
    */});

    r.resolve();

    check(r, function() {/*
      2: if &7, &14

      7: %0 = rax-out
      9: jump &23

      14: %1 = rbx-out
      15: gap {%1=>%0}
      16: jump &23

      23: return %0
    */});
  });

  it('should generate moves at block edges', function() {
    var r = fixtures.createResolver(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = jump ^b0
        }
        b0 -> b1

        b1 {
          i1 = rax-out
          i2 = jump ^b1
        }
        b1 -> b2, b3

        b2 {
          i3 = rax-out
          i4 = add i1, i3
          i5 = jump ^b2
        }
        b2 -> b1

        b3 {
          i6 = add i1, i1
          i7 = return ^b3, i6
        }
      }
    */});

    r.resolve();

    check(r, function() {/*
      2: jump &7

      7: %0 = rax-out
      9: jump &13, &21

      13: gap @{%0=>%1}
      14: %0 = rax-out
      16: %0 = add %1, %0
      18: jump &7

      21: gap {%0=>%1}
      23: %0 = add %1, %1
      25: return %0
    */});
  });

  it('should generate moves at merge', function() {
    var r = fixtures.createResolver(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = rax-out
          i1 = if ^b0
        }
        b0 -> b1, b2

        b1 {
          i2 = rax-out
          i3 = jump ^b1
        }
        b1 -> b3

        b2 {
          i4 = jump ^b2
        }
        b2 -> b3

        b3 {
          i5 = return ^b3, i0
        }
      }
    */});

    r.resolve();

    check(r, function() {/*
      2: %0 = rax-out
      4: if &8, &14

      8: gap @{%0=>%1}
      9: %0 = rax-out
      11: jump &20

      14: gap {%0=>%1}
      16: jump &20

      20: gap {%1=>%0}
      21: return %0
    */});
  });

  it('should respect register uses', function() {
    var r = fixtures.createResolver(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 1
          i1 = literal 2
          i2 = literal 3
          i3 = literal 4
          i4 = literal 5
          i5 = call i4, i0
          i6 = add i1, i1
          i7 = add i2, i2
          i8 = add i3, i3
          i9 = add i4, i4
          i10 = return ^b0, i9
        }
      }
    */});

    r.resolve();

    check(r, function() {/*
      2: %0 = literal
      4: %1 = literal
      6: %2 = literal
      8: %3 = literal
      9: gap @{%3=>[0]}
      10: %3 = literal
      11: gap @{%1=>[3],%2=>[2],%3=>[0],[0]=>[1]}
      12: %0 = call %3, %0
      14: %0 = add [3], [3]
      16: %0 = add [2], [2]
      18: %0 = add [1], [1]
      20: %0 = add [0], [0]
      22: return %0
    */});
  });

  it('should resolve branch without merge', function() {
    var r = fixtures.createResolver(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = rbx-out
          i1 = if ^b0
        }
        b0 -> b1, b2

        b1 {
          i2 = return ^b1, i0
        }

        b2 {
          i3 = return ^b2, i0
        }
      }
    */});

    r.resolve();

    // TODO(indutny): figure out how to move similar moves to the branch
    check(r, function() {/*
      2: %1 = rbx-out
      4: if &8, &12

      8: gap {%1=>%0}
      9: return %0

      12: gap {%1=>%0}
      14: return %0
    */});
  });
});
