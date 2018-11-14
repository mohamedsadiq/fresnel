import { MediaBreakpointProps } from "./Media"
import { propKey, createRuleSet, createClassName } from "./Utils"

/**
 * A union of possible breakpoint props.
 */
export type MediaBreakpointKey = keyof MediaBreakpointProps

type Tuple = [string, string]

function breakpointKey(breakpoint: string | Tuple) {
  return Array.isArray(breakpoint) ? breakpoint.join("-") : breakpoint
}

/**
 * Encapsulates all breakpoint data needed by the Media component. The data is
 * generated on initialization so no further runtime work is necessary.
 */
export class Breakpoints {
  static validKeys() {
    return ["at", "lessThan", "greaterThan", "greaterThanOrEqual", "between"]
  }

  private _sortedBreakpoints: ReadonlyArray<string>
  private _breakpoints: { [key: string]: number }
  private _mediaQueries: {
    at: Map<string, string>
    lessThan: Map<string, string>
    greaterThan: Map<string, string>
    greaterThanOrEqual: Map<string, string>
    between: Map<string, string>
  }

  constructor(breakpoints: { [key: string]: number }) {
    this._breakpoints = breakpoints

    this._sortedBreakpoints = Object.keys(breakpoints)
      .map(breakpoint => [breakpoint, breakpoints[breakpoint]])
      .sort((a, b) => (a[1] < b[1] ? -1 : 1))
      .map(breakpointAndValue => breakpointAndValue[0] as string)

    // List of all possible and valid `between` combinations
    const betweenCombinations: Tuple[] = this._sortedBreakpoints
      .slice(0, -1)
      .reduce(
        (acc, b1, i) => [
          ...acc,
          ...this._sortedBreakpoints.slice(i + 1).map(b2 => [b1, b2]),
        ],
        []
      )

    this._mediaQueries = {
      at: this._createBreakpointQueries("at", this._sortedBreakpoints),
      lessThan: this._createBreakpointQueries(
        "lessThan",
        this._sortedBreakpoints.slice(1)
      ),
      greaterThan: this._createBreakpointQueries(
        "greaterThan",
        this._sortedBreakpoints.slice(0, -1)
      ),
      greaterThanOrEqual: this._createBreakpointQueries(
        "greaterThanOrEqual",
        this._sortedBreakpoints
      ),
      between: this._createBreakpointQueries("between", betweenCombinations),
    }
  }

  public getMediaQueryTypes() {
    return this._sortedBreakpoints
  }

  public getDynamicResponsiveMediaQueries() {
    return Array.from(this._mediaQueries.at.entries()).reduce(
      (acc, [k, v]) => ({ ...acc, [k]: v }),
      {}
    )
  }

  public getLargestBreakpoint() {
    return this._sortedBreakpoints[this._sortedBreakpoints.length - 1]
  }

  public toRuleSets() {
    return Object.entries(this._mediaQueries).reduce((acc, [type, queries]) => {
      queries.forEach((query, breakpoint) => {
        // We need to invert the query, such that it matches when we want the
        // element to be hidden.
        acc.push(
          createRuleSet(
            createClassName(type, breakpoint),
            `not all and ${query}`
          )
        )
      })
      return acc
    }, [])
  }

  public shouldRenderMediaQuery(
    breakpointProps: MediaBreakpointProps,
    onlyRenderAt: string[]
  ): boolean {
    breakpointProps = this._normalizeProps(breakpointProps)
    switch (propKey(breakpointProps)) {
      case "lessThan": {
        const width = this._breakpoints[breakpointProps.lessThan]
        const lowestAllowedWidth = Math.min(
          ...onlyRenderAt.map(breakpoint => this._breakpoints[breakpoint])
        )
        return lowestAllowedWidth < width
      }
      case "greaterThan": {
        const width = this._breakpoints[
          this._findNextBreakpoint(breakpointProps.greaterThan)
        ]
        const highestAllowedWidth = Math.max(
          ...onlyRenderAt.map(breakpoint => this._breakpoints[breakpoint])
        )
        return highestAllowedWidth >= width
      }
      case "greaterThanOrEqual": {
        const width = this._breakpoints[breakpointProps.greaterThanOrEqual]
        const highestAllowedWidth = Math.max(
          ...onlyRenderAt.map(breakpoint => this._breakpoints[breakpoint])
        )
        return highestAllowedWidth >= width
      }
      case "between": {
        // TODO: This is the only useful breakpoint to negate, but we’ll
        //       we’ll see when/if we need it. We could then also decide
        //       to add `oustide`.
        const fromWidth = this._breakpoints[breakpointProps.between[0]]
        const toWidth = this._breakpoints[breakpointProps.between[1]]
        const allowedWidths = onlyRenderAt.map(
          breakpoint => this._breakpoints[breakpoint]
        )
        return !(
          Math.max(...allowedWidths) < fromWidth ||
          Math.min(...allowedWidths) >= toWidth
        )
      }
    }
  }

  private _normalizeProps(
    breakpointProps: MediaBreakpointProps
  ): MediaBreakpointProps {
    if (breakpointProps.at) {
      const fromIndex = this._sortedBreakpoints.indexOf(breakpointProps.at)
      const to = this._sortedBreakpoints[fromIndex + 1]
      return to
        ? { between: [breakpointProps.at, to] }
        : { greaterThanOrEqual: breakpointProps.at }
    }
    return breakpointProps
  }

  private _createBreakpointQuery(
    breakpointProps: MediaBreakpointProps
  ): string {
    breakpointProps = this._normalizeProps(breakpointProps)
    switch (propKey(breakpointProps)) {
      case "lessThan": {
        const width = this._breakpoints[breakpointProps.lessThan]
        return `(max-width:${width - 1}px)`
      }
      case "greaterThan": {
        const width = this._breakpoints[
          this._findNextBreakpoint(breakpointProps.greaterThan)
        ]
        return `(min-width:${width}px)`
      }
      case "greaterThanOrEqual": {
        const width = this._breakpoints[breakpointProps.greaterThanOrEqual]
        return `(min-width:${width}px)`
      }
      case "between": {
        // TODO: This is the only useful breakpoint to negate, but we’ll
        //       we’ll see when/if we need it. We could then also decide
        //       to add `outside`.
        const fromWidth = this._breakpoints[breakpointProps.between[0]]
        const toWidth = this._breakpoints[breakpointProps.between[1]]
        return `(min-width:${fromWidth}px) and (max-width:${toWidth - 1}px)`
      }
      default:
        throw new Error(
          `Unexpected breakpoint props: ${JSON.stringify(breakpointProps)}`
        )
    }
  }

  private _createBreakpointQueries(
    key: MediaBreakpointKey,
    forBreakpoints: ReadonlyArray<string | [string, string]>
  ) {
    return forBreakpoints.reduce<Map<string, string>>((map, breakpoint) => {
      map.set(
        breakpointKey(breakpoint),
        this._createBreakpointQuery({
          [key]: breakpoint,
        })
      )
      return map
    }, new Map())
  }

  private _findNextBreakpoint(breakpoint: string) {
    const nextBreakpoint = this._sortedBreakpoints[
      this._sortedBreakpoints.indexOf(breakpoint) + 1
    ]
    if (!nextBreakpoint) {
      throw new Error(`There is no breakpoint larger than ${breakpoint}`)
    }
    return nextBreakpoint
  }
}