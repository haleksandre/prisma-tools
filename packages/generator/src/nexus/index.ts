import { Options } from '@paljs/types';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { schema, DMMF } from '../schema';
import { createQueriesAndMutations } from './CreateQueriesAndMutations';
import { formation } from '../fs';

const defaultOptions: Options = {
  output: 'src/graphql',
  excludeModels: [],
  excludeFields: [],
  excludeFieldsByModel: {},
  excludeQueriesAndMutations: [],
  excludeQueriesAndMutationsByModel: {},
};

export function createSchema(customOptions?: Partial<Options>) {
  const options: Options = { ...defaultOptions, ...customOptions };
  let indexPath = `${options.output}/index.ts`;
  let index = existsSync(indexPath)
    ? readFileSync(indexPath, { encoding: 'utf-8' })
    : '';

  schema.outputTypes.forEach((model) => {
    if (
      !['Query', 'Mutation'].includes(model.name) &&
      !model.name.startsWith('Aggregate') &&
      model.name !== 'BatchPayload' &&
      (!options.models || options.models.includes(model.name))
    ) {
      const exportString = `export * from './${model.name}'`;
      if (!index.includes(exportString)) {
        index = `export * from './${model.name}'
${index}`;
      }
      let fileContent = `${
        options.nexusSchema
          ? `import { objectType } from '@nexus/schema'`
          : `import { schema } from 'nexus'`
      }
  
`;
      fileContent += `${
        options.nexusSchema ? `export const ${model.name} = ` : 'schema.'
      }objectType({
  name: '${model.name}',
  definition(t) {
    `;
      const excludeFields = options.excludeFields.concat(
        options.excludeFieldsByModel[model.name],
      );
      model.fields.forEach((field) => {
        if (!excludeFields.includes(field.name)) {
          const options = getOptions(field);
          if (
            field.outputType.kind === 'scalar' &&
            field.outputType.type !== 'DateTime'
          ) {
            fileContent += `t.${(field.outputType
              .type as String).toLowerCase()}('${field.name}'${options})
    `;
          } else {
            fileContent += `t.field('${field.name}'${options})
    `;
          }
        }
      });
      fileContent += `},
})
  
`;
      let modelIndex = `export * from './type'
`;
      modelIndex += createQueriesAndMutations(model.name, options);
      const path = `${options.output}/${model.name}`;
      !existsSync(path) && mkdirSync(path, { recursive: true });

      if (options.nexusSchema) {
        writeFileSync(`${path}/index.ts`, formation(modelIndex));
      }
      writeFileSync(`${path}/type.ts`, formation(fileContent));
    }
  });

  if (options.nexusSchema) {
    writeFileSync(`${options.output}/index.ts`, formation(index));
  }
}

function getOptions(field: DMMF.SchemaField) {
  const options: any = field.outputType.isList
    ? { nullable: false, list: [true] }
    : { nullable: !field.outputType.isRequired };
  if (
    field.outputType.kind !== 'scalar' ||
    field.outputType.type === 'DateTime'
  )
    options['type'] = field.outputType.type;
  if (field.args.length > 0) {
    field.args.forEach((arg) => {
      if (!options['args']) options['args'] = {};
      options['args'][arg.name] = arg.inputType[0].type;
    });
  }
  let toString = JSON.stringify(options);
  if (field.outputType.kind === 'object') {
    toString = toString.slice(0, -1);
    toString += `, resolve(parent: any) {
      return parent['${field.name}']
    },
    }`;
  }
  return ', ' + toString;
}
