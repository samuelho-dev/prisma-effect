# Contributing to prisma-effect-kysely

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to this project.

## 🚀 Quick Start

### Prerequisites

- **Node.js**: >= 18.0.0
- **pnpm**: >= 8.0.0 (required - this project uses pnpm workspaces)

### Setup (< 5 minutes)

1. **Fork and Clone**

   ```bash
   git clone https://github.com/YOUR_USERNAME/prisma-effect-kysely.git
   cd prisma-effect-kysely
   ```

2. **Install Dependencies**

   ```bash
   pnpm install
   ```

3. **Run Tests**

   ```bash
   pnpm test
   ```

4. **Build**
   ```bash
   pnpm run build
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
   pnpm run lint        # Check code style
   pnpm run typecheck   # Check TypeScript types
   pnpm run test        # Run tests
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
pnpm run lint:fix    # Fix linting issues
pnpm run format      # Format all files
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
pnpm test                # Run all tests
pnpm run test:watch      # Watch mode
pnpm run test:coverage   # Coverage report
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
├── generator/          # Generator entry point and orchestration
│   ├── index.ts       # Prisma generator handler
│   └── orchestrator.ts # Coordinates generation flow
├── prisma/            # Prisma domain logic (DMMF parsing)
│   ├── generator.ts   # Prisma data extraction
│   ├── type.ts        # Type utilities
│   ├── enum.ts        # Enum utilities
│   └── relation.ts    # Relation detection
├── effect/            # Effect Schema generation
│   ├── generator.ts   # Effect schema orchestration
│   ├── type.ts        # Type schema generation
│   ├── enum.ts        # Enum schema generation
│   └── join-table.ts  # Join table schemas
├── kysely/            # Kysely integration
│   ├── generator.ts   # Kysely-specific generation
│   ├── type.ts        # Kysely type mappings
│   └── helpers.ts     # Runtime helpers (exported)
├── utils/             # Shared utilities
│   ├── naming.ts      # Naming conventions
│   ├── templates.ts   # Code formatting
│   └── annotations.ts # Custom type annotations
└── __tests__/         # Test files
```

## 🔍 Architecture Principles

1. **Domain-Driven Design**: Separate Prisma, Effect, and Kysely concerns
2. **Zero Type Coercion**: Use exact DMMF types from Prisma
3. **Deterministic Output**: Alphabetically sorted for consistency
4. **Pure Functions**: No side effects in core logic
5. **Test-Driven Development**: Write tests before implementation

## 🐛 Reporting Bugs

1. **Search existing issues** to avoid duplicates
2. **Use the bug template** when creating an issue
3. **Include**:
   - Minimal reproduction case
   - Expected vs actual behavior
   - Your environment (Node, pnpm, Prisma versions)
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

See [SECURITY.md](SECURITY.md) for reporting security vulnerabilities.

## ✅ Pull Request Checklist

Before submitting your PR, ensure:

- [ ] Code follows project style (ESLint/Prettier pass)
- [ ] All tests pass (`pnpm test`)
- [ ] TypeScript compiles (`pnpm run typecheck`)
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
- **Security**: See SECURITY.md
- **Chat**: GitHub Discussions

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing! Every contribution, no matter how small, is valued and appreciated.** 🙏
