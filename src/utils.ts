export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export function mapTraverse<T>(o: T, ...args){
    function inner(o:T){
        if (typeof o === "string"){
            if(o.startsWith('lambda')) return window.eval(o.slice(7))(...args)
        }
        if (typeof o === "string" && o.startsWith('lambda')) return window.eval(o.slice(7))(...args)
        if (Array.isArray(o)) return o.map(inner);
        if (o instanceof Date) return o;
        if (o && typeof o == "object") return Object.fromEntries(Object.entries(o).map(([key, value])=>[key, inner(value)]))
        return o;
    }
    return inner(o);
}