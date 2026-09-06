# Contributing to prisma-effect-kysely

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to this project.

## 🚀 Quick Start

### Prerequisites

- **Node.js**: >= 20.0.0
- **Bun**: >= 1.0.0 (Bun is the only package manager for this repo)

### Setup (< 5 minutes)

1. **Fork and Clone**

   ```bash
   git clone https://github.com/YOUR_USERNAME/prisma-effect-kysely.git
   cd prisma-effect-kysely
   ```

2. **Install Dependencies**

   ```bash
   bun install
   ```

3. **Run Tests**

   ```bash
   bun run test
   ```

4. **Build**
   ```bash
   bun run build
   ```

That's it! You're ready to contribute.

## 📋 Development Workflow

### Branch Strategy

- `main` - Production-ready code
- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation updates

### Making Changes

1. **Create a branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow the coding standards (enforced by ESLint/Prettier)
   - Add tests for new functionality
   - Update documentation if needed

3. **Run quality checks**

   ```bash
   bun run lint        # Check code style
   bun run typecheck   # Check TypeScript types
   bun run test        # Run tests
   ```

4. **Commit your changes**

   ```bash
   git add .
   git commit -m "feat: add amazing feature"
   ```

   **Note**: Pre-commit hooks will automatically run lint and format checks. Commits will be blocked if checks fail.

5. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

## 🎯 Coding Standards

### TypeScript

- **Strict Mode**: All code must pass TypeScript strict mode
- **No Type Coercion**: Never use `as` or `any` unless absolutely necessary
- **Explicit Types**: Prefer explicit return types for public APIs

### Code Style

- **ESLint**: Configuration in `eslint.config.js`
- **Prettier**: Configuration in `.prettierrc.json`
- **Auto-fix**: Pre-commit hooks auto-fix most issues

Run manually:

```bash
bun run lint:fix    # Fix linting issues
bun run format      # Format all files
```

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation only
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

**Examples:**

```bash
feat: add support for Decimal type mapping
fix: resolve UUID detection for Int fields
docs: update README with installation steps
test: add edge cases for enum generation
```

## 🧪 Testing

### Test Requirements

- **Coverage**: Maintain > 90% code coverage
- **Test Structure**: Use AAA pattern (Arrange, Act, Assert)
- **Naming**: Descriptive test names using `describe` and `it`

### Running Tests

```bash
bun run test           # Run all tests
bun run test:watch     # Watch mode
bun run test:coverage  # Coverage report
```

### Writing Tests

```typescript
describe('FeatureName', () => {
  it('should handle expected input correctly', () => {
    // Arrange
    const input = ...

    // Act
    const result = ...

    // Assert
    expect(result).toBe(...)
  });
});
```

## 📦 Project Structure

```
src/
├── generator/          # CLI, public API, and orchestration
│   ├── cli.ts
│   ├── index.ts
│   └── orchestrator.ts
├── prisma/             # Prisma 8 contract validation and table derivation
│   ├── contract.ts
│   └── model.ts
├── effect/             # Effect Schema emission
│   ├── generator.ts
│   ├── type.ts
│   └── enum.ts
├── kysely/             # Kysely integration
│   ├── generator.ts
│   ├── type.ts
│   └── helpers.ts
├── utils/              # Naming, formatting, annotations, and file writes
└── __tests__/          # Contract fixture and behavior tests
```

## Architecture Principles

1. Validate `contract.json` at the boundary
2. Derive output from contract codecs and physical storage metadata
3. Keep generated output deterministic
4. Keep derivation pure; isolate file writes in the orchestrator
5. Test observable generated contracts

## 🐛 Reporting Bugs

1. **Search existing issues** to avoid duplicates
2. **Use the bug template** when creating an issue
3. **Include**:
   - Minimal reproduction case
   - Expected vs actual behavior
   - Your environment (Node, Bun, Prisma versions)
   - Relevant schema snippet

## ✨ Requesting Features

1. **Check existing feature requests** first
2. **Open a discussion** to gather feedback
3. **Explain the use case** and why it's valuable
4. **Consider contributing** the implementation!

## 📝 Documentation

- **README**: User-facing documentation
- **CLAUDE.md**: Developer/AI assistant instructions
- **Code Comments**: For complex logic only
- **JSDoc**: For public APIs

## 🔐 Security

Report security issues privately through GitHub Security Advisories when
available. If that is not available, open a minimal issue that avoids exposing
sensitive details publicly.

## ✅ Pull Request Checklist

Before submitting your PR, ensure:

- [ ] Code follows project style (ESLint/Prettier pass)
- [ ] All tests pass (`bun run test`)
- [ ] TypeScript compiles (`bun run typecheck`)
- [ ] Test coverage maintained (> 90%)
- [ ] New features have tests
- [ ] Breaking changes are documented
- [ ] Commit messages follow conventional commits
- [ ] PR description explains changes clearly

## 🎉 Recognition

Contributors will be:

- Listed in release notes
- Credited in CHANGELOG.md
- Added to GitHub contributors list

## 📞 Getting Help

- **Questions**: Open a GitHub Discussion
- **Bugs**: Open a GitHub Issue
- **Security**: Use GitHub Security Advisories when available
- **Chat**: GitHub Discussions

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing! Every contribution, no matter how small, is valued and appreciated.** 🙏
