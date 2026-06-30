export async function resolve(specifier, context, nextResolve) {
    if (specifier === 'typescript') {
        return nextResolve('typescript-js', context);
    }
    return nextResolve(specifier, context);
}
