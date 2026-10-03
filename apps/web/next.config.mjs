/** @type {import('next').NextConfig} */
export default {
  // The contract ships as TypeScript source, so Next must compile it.
  transpilePackages: ["@hack/contract"],
};
