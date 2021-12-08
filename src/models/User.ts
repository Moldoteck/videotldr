import * as findorcreate from 'mongoose-findorcreate'
import { FindOrCreate } from '@typegoose/typegoose/lib/defaultClasses'
import { getModelForClass, plugin, prop } from '@typegoose/typegoose'

@plugin(findorcreate)
export class User extends FindOrCreate {
  @prop({ required: true, index: true, unique: true })
  id!: number
  @prop({ required: true, default: 'en' })
  language!: string
  @prop({ default: '' })
  smmry_api!: string
  @prop({ default: '' })
  smmry_limit!: string
}

const UserModel = getModelForClass(User, {
  schemaOptions: { timestamps: true },
})

export function findOrCreateUser(id: number) {
  return UserModel.findOrCreate({ id })
}

//count users
export function countUsers() {
  return UserModel.countDocuments()
}
