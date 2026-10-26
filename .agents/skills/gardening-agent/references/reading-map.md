# Reading map

Use published contents as review lenses. The questions below are adaptations for
Mibba, not quotations or claims that a book reviewed this repository.

| Source                                                                                                 | Questions for the review                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Clean Code, 2008 contents](https://www.oreilly.com/library/view/clean-code-a/9780136083238/toc.xhtml) | Do names express the same domain concept consistently? Does one module mix unrelated reasons to change? Where do errors disappear or callers repeat handling rules?               |
| [Release It!, second edition](https://pragprog.com/titles/mnee2/release-it-second-edition/)            | Can integration latency exhaust capacity? Are retries, fan-out and result sets bounded? Where does failure propagate across unrelated work? Is deployment compatibility enforced? |
| [React state structure](https://react.dev/learn/choosing-the-state-structure)                          | Is stored state redundant or contradictory? Are updates spread across several owners? Can the shape express only valid domain states?                                             |
| [React Effects](https://react.dev/learn/you-might-not-need-an-effect)                                  | Which external system is an Effect synchronizing? Can derived state be computed during rendering? Does a user action belong in an event handler?                                  |

Adapt class-oriented examples to TypeScript modules, hooks and workflows. A large
implementation behind a small interface can be appropriate. Treat extraction into
many small files as a tradeoff, not an automatic improvement. Honor Mibba's existing
Effect and shared-interface decisions before suggesting another abstraction.

"Release Design Production" was interpreted as Release It!. No specific React book
has been confirmed. Add another source only with its exact title, edition and link;
do not invent a table of contents or copy a book into this skill.
