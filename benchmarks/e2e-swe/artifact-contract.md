# Artifact execution contract

The product goal and behavioral specification are in the original instruction.md.
This addendum clarifies packaging and execution, not an implementation plan.

The submitted artifact is the contents of /app. Evaluation copies those files into
a fresh offline container using the same base image. Packages installed only in
the implementation container are not transferred. The evaluator runs
`bash ./setup.sh` from /app before testing the installed package. Your artifact
must therefore include a setup.sh that builds/installs your project offline with
the available dependencies. A successful installation in the current container
alone does not demonstrate reproducibility in a fresh container.

No evaluator tests, reference implementation, expected answers or task
decomposition are supplied by this contract.
